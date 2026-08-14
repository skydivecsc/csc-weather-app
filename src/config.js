const trimTrailingSlash = (value) => value.replace(/\/$/, "");

export const LOGIN_BASE_URL = trimTrailingSlash(
  import.meta.env.VITE_LOGIN_BASE_URL || "https://login.cscwx2.com"
);

export const PUBLIC_SITE_URL = trimTrailingSlash(
  import.meta.env.VITE_PUBLIC_SITE_URL || "https://cscwx2.com"
);

export const PUBLIC_SITE_LABEL =
  import.meta.env.VITE_PUBLIC_SITE_LABEL || "cscwx2.com";
