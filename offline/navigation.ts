const router = {
  push: (url: string) => location.assign(url), replace: (url: string) => location.replace(url),
  back: () => history.back(), forward: () => history.forward(), refresh: () => location.reload(), prefetch: async () => {},
};
export function useRouter() { return router; }
