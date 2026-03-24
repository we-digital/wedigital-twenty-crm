import { currentUserState } from '@/auth/states/currentUserState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { useIsPageLayoutInEditMode } from '@/page-layout/hooks/useIsPageLayoutInEditMode';
import { type PageLayoutWidget } from '@/page-layout/types/PageLayoutWidget';
import { PageLayoutWidgetNoDataDisplay } from '@/page-layout/widgets/components/PageLayoutWidgetNoDataDisplay';
import { WidgetSkeletonLoader } from '@/page-layout/widgets/components/WidgetSkeletonLoader';
import { styled } from '@linaria/react';
import { type SyntheticEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme-constants';

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

// Builds a widget:context or widget:context:update envelope following the
// canonical iframe postMessage contract (docs/iframe-postmessage-contract.md
// in widget-mrz-input).
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
  const targetOrigin = isDefined(url) ? getUrlOrigin(url) : null;

  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Ref to the iframe DOM element so we can verify event.source on inbound messages.
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Whether the widget iframe has announced readiness (widget:ready received).
  const isWidgetReady = useRef(false);

  const accessToken = tokenPair?.accessOrWorkspaceAgnosticToken?.token;

  // Sends widget:context to the iframe. Called after widget:ready and whenever
  // the token changes (as widget:context:update).
  const sendContext = useCallback(
    (type: 'widget:context' | 'widget:context:update') => {
      if (!isDefined(targetOrigin) || !isDefined(iframeRef.current)) return;
      iframeRef.current.contentWindow?.postMessage(
        buildWidgetContextMessage(type, accessToken, currentUser),
        targetOrigin,
      );
    },
    [targetOrigin, accessToken, currentUser],
  );

  // Listen for widget:ready and widget:ack from the iframe.
  // Responds to widget:ready with widget:context (auth + userContext).
  // Security: only accept messages from our own iframe element at the expected origin.
  useEffect(() => {
    if (!isDefined(targetOrigin)) return;

    function onMessage(event: MessageEvent) {
      // Must come from our iframe window at the configured origin.
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.origin !== targetOrigin) return;

      const msg = event.data as Record<string, unknown> | null;
      if (!isDefined(msg) || msg.version !== 1) return;

      if (msg.type === 'widget:ready') {
        isWidgetReady.current = true;
        sendContext('widget:context');
      }
      // widget:ack is informational — no action needed.
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [targetOrigin, sendContext]);

  // Send widget:context:update whenever the access token changes after
  // the widget is already loaded and has announced readiness.
  useEffect(() => {
    if (!isWidgetReady.current) return;
    sendContext('widget:context:update');
  }, [accessToken, sendContext]);

  // Send widget:reset when the widget unmounts (logout / navigation away).
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

    // Also send the legacy twenty:user-context for any non-upgraded consumers.
    event.currentTarget.contentWindow?.postMessage(
      {
        type: 'twenty:user-context',
        payload: { userContext: currentUser },
      },
      targetOrigin,
    );

    // The widget will announce widget:ready after mounting; we respond then.
    // If widget:ready was already received (e.g. fast load), send context now.
    if (isWidgetReady.current) {
      sendContext('widget:context');
    }
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  if (hasError || !isDefined(url) || (isDefined(currentUser) && !targetOrigin)) {
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
        src={url}
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
