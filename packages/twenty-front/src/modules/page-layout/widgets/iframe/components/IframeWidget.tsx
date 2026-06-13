import { currentUserState } from '@/auth/states/currentUserState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { useIsPageLayoutInEditMode } from '@/page-layout/hooks/useIsPageLayoutInEditMode';
import { type PageLayoutWidget } from '@/page-layout/types/PageLayoutWidget';
import { PageLayoutWidgetNoDataDisplay } from '@/page-layout/widgets/components/PageLayoutWidgetNoDataDisplay';
import { WidgetSkeletonLoader } from '@/page-layout/widgets/components/WidgetSkeletonLoader';
import { styled } from '@linaria/react';
import {
  type SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { getSafeUrl, isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui-deprecated/theme-constants';

const StyledContainer = styled.div<{ $isEditMode: boolean }>`
  background: ${themeCssVariables.background.primary};
  border-radius: ${themeCssVariables.border.radius.md};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  pointer-events: ${({ $isEditMode }) => ($isEditMode ? 'none' : 'auto')};
  position: relative;
  width: 100%;
`;

const StyledIframe = styled.iframe<{ $isEditMode: boolean }>`
  border: none;
  flex: 1;
  height: 100%;
  pointer-events: ${({ $isEditMode }) => ($isEditMode ? 'none' : 'auto')};
  width: 100%;
`;

const StyledLoadingContainer = styled.div`
  background: ${themeCssVariables.background.primary};
  bottom: 0;
  left: 0;
  padding-left: ${themeCssVariables.spacing[2]};
  padding-top: ${themeCssVariables.spacing[2]};
  pointer-events: none;
  position: absolute;
  right: 0;
  top: 0;
  z-index: 1;
`;

const StyledErrorContainer = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: center;
  padding: ${themeCssVariables.spacing[4]};
  text-align: center;
`;

export type IframeWidgetProps = {
  widget: PageLayoutWidget;
};

const getUrlOrigin = (url: string): string | null => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

function buildWidgetContextMessage(
  type: 'widget:context' | 'widget:context:update',
  token: string | undefined,
  userContext: unknown,
) {
  return {
    source: 'twenty' as const,
    target: 'widget-mrz-input',
    version: 1 as const,
    type,
    requestId: crypto.randomUUID(),
    payload: {
      ...(isDefined(token) && {
        auth: { scheme: 'bearer' as const, token },
      }),
      userContext,
    },
  };
}

export const IframeWidget = ({ widget }: IframeWidgetProps) => {
  const isPageLayoutInEditMode = useIsPageLayoutInEditMode();
  const currentUser = useAtomStateValue(currentUserState);
  const tokenPair = useAtomStateValue(tokenPairState);

  const configuration = widget.configuration;

  if (!isDefined(configuration) || !('url' in configuration)) {
    throw new Error(`Invalid configuration for widget ${widget.id}`);
  }

  const url = configuration.url;
  const title = widget.title;
  const safeUrl = isDefined(url) ? getSafeUrl(url) : undefined;
  const isHttpUrl = isDefined(safeUrl) && /^https?:\/\//i.test(safeUrl);
  const targetOrigin = isDefined(safeUrl) ? getUrlOrigin(safeUrl) : null;

  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isWidgetReady, setIsWidgetReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const accessToken = tokenPair?.accessOrWorkspaceAgnosticToken?.token;

  const sendContext = useCallback(
    (type: 'widget:context' | 'widget:context:update') => {
      if (!isDefined(targetOrigin) || !isDefined(iframeRef.current)) return;

      iframeRef.current.contentWindow?.postMessage(
        buildWidgetContextMessage(type, accessToken, currentUser),
        targetOrigin,
      );
    },
    [accessToken, currentUser, targetOrigin],
  );

  useEffect(() => {
    if (!isDefined(targetOrigin)) return;

    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.origin !== targetOrigin) return;

      const msg = event.data as Record<string, unknown> | null;

      if (!isDefined(msg) || msg.version !== 1) return;

      if (msg.type === 'widget:ready') {
        setIsWidgetReady(true);
        sendContext('widget:context');
      }
    }

    window.addEventListener('message', onMessage);

    return () => window.removeEventListener('message', onMessage);
  }, [sendContext, targetOrigin]);

  useEffect(() => {
    if (!isWidgetReady) return;

    sendContext('widget:context:update');
  }, [accessToken, isWidgetReady, sendContext]);

  useEffect(() => {
    return () => {
      if (!isDefined(targetOrigin) || !isDefined(iframeRef.current)) return;

      iframeRef.current.contentWindow?.postMessage(
        {
          source: 'twenty',
          target: 'widget-mrz-input',
          version: 1,
          type: 'widget:reset',
          requestId: crypto.randomUUID(),
          payload: {},
        },
        targetOrigin,
      );
    };
  }, [targetOrigin]);

  const handleIframeLoad = (event: SyntheticEvent<HTMLIFrameElement>) => {
    setIsLoading(false);

    if (!isDefined(currentUser) || !isDefined(targetOrigin)) {
      return;
    }

    event.currentTarget.contentWindow?.postMessage(
      {
        type: 'twenty:user-context',
        payload: { userContext: currentUser },
      },
      targetOrigin,
    );

    if (isWidgetReady) {
      sendContext('widget:context');
    }
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  if (hasError || !isHttpUrl || (isDefined(currentUser) && !targetOrigin)) {
    return (
      <StyledContainer $isEditMode={isPageLayoutInEditMode}>
        <StyledErrorContainer>
          <PageLayoutWidgetNoDataDisplay />
        </StyledErrorContainer>
      </StyledContainer>
    );
  }

  return (
    <StyledContainer $isEditMode={isPageLayoutInEditMode}>
      {isLoading && (
        <StyledLoadingContainer>
          <WidgetSkeletonLoader />
        </StyledLoadingContainer>
      )}
      <StyledIframe
        $isEditMode={isPageLayoutInEditMode}
        ref={iframeRef}
        src={safeUrl}
        title={title}
        onLoad={handleIframeLoad}
        onError={handleIframeError}
        sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
        allow="encrypted-media"
        allowFullScreen
      />
    </StyledContainer>
  );
};
