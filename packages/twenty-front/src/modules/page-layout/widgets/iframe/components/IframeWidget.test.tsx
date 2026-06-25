import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { PageLayoutEditModeProviderContext } from '@/page-layout/contexts/PageLayoutEditModeContext';
import { type PageLayoutWidget } from '@/page-layout/types/PageLayoutWidget';
import { IframeWidget } from '@/page-layout/widgets/iframe/components/IframeWidget';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { type ReactNode } from 'react';
import { ThemeProvider } from 'twenty-ui/theme-constants';
import {
  OnboardingStatus,
  WidgetType,
  WorkspaceMemberDateFormatEnum,
  WorkspaceMemberNumberFormatEnum,
  WorkspaceMemberTimeFormatEnum,
} from '~/generated-metadata/graphql';

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

const mockWorkspaceMember = {
  id: 'workspace-member-id',
  name: {
    firstName: 'John',
    lastName: 'Doe',
  },
  avatarUrl: null,
  locale: 'en-US',
  colorScheme: 'Dark' as const,
  userEmail: 'john.doe@acme.com',
  userWorkspaceId: 'workspace-id',
  timeZone: 'Asia/Bangkok',
  dateFormat: WorkspaceMemberDateFormatEnum.MONTH_FIRST,
  timeFormat: WorkspaceMemberTimeFormatEnum.HOUR_24,
  numberFormat: WorkspaceMemberNumberFormatEnum.COMMA_DECIMAL,
  calendarStartDay: 1,
};

const mockTokenPair = {
  accessToken: null,
  accessOrWorkspaceAgnosticToken: {
    expiresAt: '2026-06-20T10:00:00.000Z',
    token: 'access-token-123',
  },
  refreshToken: {
    expiresAt: '2026-06-21T10:00:00.000Z',
    token: 'refresh-token-123',
  },
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
    <ThemeProvider colorScheme="light">
      <JotaiProvider store={store}>
        <PageLayoutEditModeProviderContext value={{ isInEditMode: false }}>
          {children}
        </PageLayoutEditModeProviderContext>
      </JotaiProvider>
    </ThemeProvider>
  );
};

describe('IframeWidget', () => {
  beforeEach(() => {
    jest
      .spyOn(global.crypto, 'randomUUID')
      .mockReturnValue('request-id-123');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends legacy user context on iframe load', () => {
    render(<IframeWidget widget={buildWidget('https://example.com/embed')} />, {
      wrapper: ({ children }) => (
        <Wrapper
          initializeStore={(store) => {
            store.set(currentUserState.atom, mockCurrentUser);
            store.set(currentWorkspaceMemberState.atom, mockWorkspaceMember);
          }}
        >
          {children}
        </Wrapper>
      ),
    });

    const iframeElement = screen.getByTitle('Dashboard') as HTMLIFrameElement;
    const postMessageSpy = jest.spyOn(
      iframeElement.contentWindow!,
      'postMessage',
    );

    fireEvent.load(iframeElement);

    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        type: 'twenty:user-context',
        payload: {
          userContext: {
            ...mockCurrentUser,
            colorScheme: 'Dark',
            workspaceMember: mockWorkspaceMember,
            workspaceMemberId: 'workspace-member-id',
          },
        },
      },
      'https://example.com',
    );
  });

  it('responds to widget:ready with auth, workspace member, and host context', () => {
    render(<IframeWidget widget={buildWidget('https://example.com/embed')} />, {
      wrapper: ({ children }) => (
        <Wrapper
          initializeStore={(store) => {
            store.set(currentUserState.atom, mockCurrentUser);
            store.set(currentWorkspaceMemberState.atom, mockWorkspaceMember);
            store.set(tokenPairState.atom, mockTokenPair);
          }}
        >
          {children}
        </Wrapper>
      ),
    });

    const iframeElement = screen.getByTitle('Dashboard') as HTMLIFrameElement;
    const iframeWindow = iframeElement.contentWindow;
    const postMessageSpy = jest.spyOn(iframeWindow!, 'postMessage');

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            source: 'widget',
            target: 'host',
            version: 1,
            type: 'widget:ready',
            requestId: 'widget-ready-id',
            payload: {},
          },
          origin: 'https://example.com',
          source: iframeWindow,
        }),
      );
    });

    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        source: 'twenty',
        target: 'widget-mrz-input',
        version: 1,
        type: 'widget:context',
        requestId: 'request-id-123',
        payload: {
          auth: {
            scheme: 'bearer',
            token: 'access-token-123',
          },
          userContext: {
            ...mockCurrentUser,
            colorScheme: 'Dark',
            workspaceMember: mockWorkspaceMember,
            workspaceMemberId: 'workspace-member-id',
          },
          hostContext: {
            workspaceId: 'workspace-id',
          },
        },
      },
      'https://example.com',
    );
  });

  it('renders fallback when URL is not valid', () => {
    render(<IframeWidget widget={buildWidget('javascript:alert(1)')} />, {
      wrapper: ({ children }) => <Wrapper>{children}</Wrapper>,
    });

    expect(screen.queryByTitle('Dashboard')).not.toBeInTheDocument();
    expect(screen.getByText('Invalid URL')).toBeInTheDocument();
  });
});
