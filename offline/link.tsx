import { forwardRef, type ComponentProps } from "react";
/** OfflineSupport handles same-origin clicks. Modified clicks retain native anchor behavior. */
const Link = forwardRef<HTMLAnchorElement, ComponentProps<"a"> & { prefetch?: boolean; scroll?: boolean; replace?: boolean }>(function Link({ prefetch: _prefetch, scroll: _scroll, replace: _replace, ...props }, ref) {
  return <a ref={ref} {...props} />;
});
export default Link;
