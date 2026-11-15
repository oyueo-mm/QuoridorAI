import { renderToStaticMarkup } from 'react-dom/server';
import { HomeView } from './views/HomeView';
import { SiteHeader } from './components/SiteHeader';

export function render() {
  const noop = () => {};
  return renderToStaticMarkup(
    <div className="min-h-screen bg-paper text-ink" data-prerender>
      <SiteHeader route="home" go={noop} />
      <div><HomeView onOpen={noop} onOpenMode={noop} onOpenVariants={noop} /></div>
    </div>,
  );
}
