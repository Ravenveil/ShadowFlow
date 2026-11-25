import { useCallback, useEffect, useState } from 'react';
import { Shell } from '@/app/shell/Shell';
import { Landing } from '@/landing/Landing';

type Route = 'landing' | 'app';

/** 支持两条路：`/app` 路径（Figma 抓稿要能带 #capture 参数）与 `#/app` 老链。 */
function readRoute(): Route {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path.endsWith('/app')) return 'app';
  return window.location.hash.startsWith('#/app') ? 'app' : 'landing';
}

export default function App() {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const sync = () => setRoute(readRoute());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  const go = useCallback((r: Route) => {
    const url = r === 'app' ? '/app' : '/';
    window.history.pushState({}, '', url);
    setRoute(r);
  }, []);

  if (route === 'app') return <Shell onExit={() => go('landing')} />;
  return <Landing onEnter={() => go('app')} />;
}
