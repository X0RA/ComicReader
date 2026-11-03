import { forwardRef, type ComponentProps } from "react";
/** Offline navigation is ordinary document navigation, with no Next server requests. */
const Link = forwardRef<HTMLAnchorElement, ComponentProps<"a"> & { prefetch?: boolean; scroll?: boolean; replace?: boolean }>(function Link({ prefetch: _prefetch, scroll: _scroll, replace: _replace, ...props }, ref) {
  return <a ref={ref} {...props} />;
});
export default Link;
