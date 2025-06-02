import { NavigateFunction, useNavigate, Path } from 'react-router-domv6plus';
import { RoutingDemoNavigationType } from './RoutingDemoContext';
import { useHistory } from 'react-router-domv4v5';
import { useCallback } from 'react';

const useConditionalNavigate = (
  navigationType: RoutingDemoNavigationType | null
): NavigateFunction => {
  if (navigationType === 'declarativeV4V5') {
    return (_page: number | string | Partial<Path>) => {};
  }

  return useNavigate();
};

const useMultiVersionNavigate = (
  navigationType: RoutingDemoNavigationType | null
) => {
  const navigate = useConditionalNavigate(navigationType);
  const history = useHistory();

  const navigateToPage = useCallback(
    (page: string) => {
      switch (navigationType) {
        case 'declarativeV4V5':
          history.push(page);
          break;
        case 'declarativeV6+':
          navigate(page);
          break;
        default:
          console.warn('Unknown navigation type');
      }
    },
    [navigationType, history, navigate]
  );

  const navigateBack = useCallback(() => {
    switch (navigationType) {
      case 'declarativeV4V5':
        history.goBack();
        break;
      case 'declarativeV6+':
        navigate(-1);
        break;
      default:
        console.warn('Unknown navigation type');
    }
  }, [navigationType, history, navigate]);

  return { navigateToPage, navigateBack };
};

export { useMultiVersionNavigate };
