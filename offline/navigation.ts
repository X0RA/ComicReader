export function navigateOffline(url: string, replace = false) {
  if (replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
  window.scrollTo(0, 0);
  window.dispatchEvent(new Event("offline-navigation"));
}
const router = {
  push: (url: string) => navigateOffline(url), replace: (url: string) => navigateOffline(url, true),
  back: () => history.back(), forward: () => history.forward(), refresh: () => location.reload(), prefetch: async () => {},
};
export function useRouter() { return router; }
