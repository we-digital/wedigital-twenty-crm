import { currentUserState } from '@/auth/states/currentUserState';
import { PageLayoutComponentInstanceContext } from '@/page-layout/states/contexts/PageLayoutComponentInstanceContext';
import { type PageLayoutWidget } from '@/page-layout/types/PageLayoutWidget';
import { IframeWidget } from '@/page-layout/widgets/iframe/components/IframeWidget';
import { ThemeProvider } from '@emotion/react';
import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { type MutableSnapshot, RecoilRoot } from 'recoil';
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
  initializeState,
}: {
  children: ReactNode;
  initializeState?: (snapshot: MutableSnapshot) => void;
}) => (
  <ThemeProvider theme={THEME_LIGHT}>
    <RecoilRoot initializeState={initializeState}>
      <PageLayoutComponentInstanceContext.Provider
        value={{
          instanceId: 'test',
        }}
      >
        {children}
      </PageLayoutComponentInstanceContext.Provider>
    </RecoilRoot>
  </ThemeProvider>
);

describe('IframeWidget', () => {
  it('appends userId query param when not present', () => {
    render(<IframeWidget widget={buildWidget('https://example.com/embed')} />, {
      wrapper: ({ children }) => (
        <Wrapper
          initializeState={({ set }) => {
            set(currentUserState, mockCurrentUser);
          }}
        >
          {children}
        </Wrapper>
      ),
    });

    const iframeElement = screen.getByTitle('Dashboard');
    const iframeUrl = new URL(iframeElement.getAttribute('src') as string);

    expect(iframeUrl.searchParams.get('userId')).toBe('user-id-123');
  });

  it('overwrites existing userId and preserves other query params', () => {
    render(
      <IframeWidget
        widget={buildWidget(
          'https://example.com/embed?foo=bar&userId=old-user-id',
        )}
      />,
      {
        wrapper: ({ children }) => (
          <Wrapper
            initializeState={({ set }) => {
              set(currentUserState, mockCurrentUser);
            }}
          >
            {children}
          </Wrapper>
        ),
      },
    );

    const iframeElement = screen.getByTitle('Dashboard');
    const iframeUrl = new URL(iframeElement.getAttribute('src') as string);

    expect(iframeUrl.searchParams.get('userId')).toBe('user-id-123');
    expect(iframeUrl.searchParams.get('foo')).toBe('bar');
  });

  it('keeps original URL when current user is not loaded', () => {
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
  });

  it('renders fallback when URL cannot be parsed with user context', () => {
    render(<IframeWidget widget={buildWidget('not-a-valid-url')} />, {
      wrapper: ({ children }) => (
        <Wrapper
          initializeState={({ set }) => {
            set(currentUserState, mockCurrentUser);
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
