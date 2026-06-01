import { currentUserState } from '@/auth/states/currentUserState';
import { PageLayoutComponentInstanceContext } from '@/page-layout/states/contexts/PageLayoutComponentInstanceContext';
import { type PageLayoutWidget } from '@/page-layout/types/PageLayoutWidget';
import { IframeWidget } from '@/page-layout/widgets/iframe/components/IframeWidget';
import { ThemeProvider } from '@emotion/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { type ReactNode } from 'react';
import { THEME_LIGHT } from 'twenty-ui/theme';
import { OnboardingStatus, WidgetType } from '~/generated-metadata/graphql';

jest.mock(
  '@/page-layout/widgets/components/PageLayoutWidgetNoDataDisplay',
  () => ({
    PageLayoutWidgetNoDataDisplay: () => <div>Invalid URL</div>,
  }),
);

const mockCurrentUser = {
  id: 'user-id-123',
  email: 'john.doe@acme.com',
  supportUserHash: null,
  canAccessFullAdminPanel: false,
  canImpersonate: false,
  onboardingStatus: OnboardingStatus.COMPLETED,
  userVars: {},
  firstName: 'John',
  lastName: 'Doe',
  hasPassword: true,
};

const buildWidget = (url: string | null): PageLayoutWidget =>
  ({
    __typename: 'PageLayoutWidget',
    id: 'widget-id',
    pageLayoutTabId: 'tab-id',
    title: 'Dashboard',
    type: WidgetType.IFRAME,
    configuration: {
      __typename: 'IframeConfiguration',
      configurationType: 'IFRAME',
      url,
    },
    gridPosition: {
      __typename: 'GridPosition',
      row: 0,
      column: 0,
      rowSpan: 4,
      columnSpan: 4,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    objectMetadataId: null,
  }) as PageLayoutWidget;

const Wrapper = ({
  children,
  initializeStore,
}: {
  children: ReactNode;
  initializeStore?: (store: ReturnType<typeof createStore>) => void;
}) => {
  const store = createStore();
  initializeStore?.(store);

  return (
    <ThemeProvider theme={THEME_LIGHT}>
      <JotaiProvider store={store}>
        <PageLayoutComponentInstanceContext.Provider
          value={{
            instanceId: 'test',
          }}
        >
          {children}
        </PageLayoutComponentInstanceContext.Provider>
      </JotaiProvider>
    </ThemeProvider>
  );
};

describe('IframeWidget', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps original URL and sends full user context via postMessage on load', () => {
    const postMessageSpy = jest.spyOn(Window.prototype, 'postMessage');

    render(<IframeWidget widget={buildWidget('https://example.com/embed')} />, {
      wrapper: ({ children }) => (
        <Wrapper
          initializeStore={(store) => {
            store.set(currentUserState.atom, mockCurrentUser);
          }}
        >
          {children}
        </Wrapper>
      ),
    });

    const iframeElement = screen.getByTitle('Dashboard');
    expect(iframeElement.getAttribute('src')).toBe('https://example.com/embed');

    fireEvent.load(iframeElement);

    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        type: 'twenty:user-context',
        payload: {
          userContext: mockCurrentUser,
        },
      },
      'https://example.com',
    );
  });

  it('does not send postMessage when current user is not loaded', () => {
    const postMessageSpy = jest.spyOn(Window.prototype, 'postMessage');

    render(
      <IframeWidget
        widget={buildWidget('https://example.com/embed?foo=bar')}
      />,
      {
        wrapper: ({ children }) => <Wrapper>{children}</Wrapper>,
      },
    );

    const iframeElement = screen.getByTitle('Dashboard');

    expect(iframeElement.getAttribute('src')).toBe(
      'https://example.com/embed?foo=bar',
    );

    fireEvent.load(iframeElement);

    expect(postMessageSpy).not.toHaveBeenCalled();
  });

  it('renders fallback when URL cannot be parsed with user context', () => {
    render(<IframeWidget widget={buildWidget('not-a-valid-url')} />, {
      wrapper: ({ children }) => (
        <Wrapper
          initializeStore={(store) => {
            store.set(currentUserState.atom, mockCurrentUser);
          }}
        >
          {children}
        </Wrapper>
      ),
    });

    expect(screen.queryByTitle('Dashboard')).not.toBeInTheDocument();
    expect(screen.getByText('Invalid URL')).toBeInTheDocument();
  });
});
