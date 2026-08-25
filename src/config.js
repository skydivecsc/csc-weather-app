const requiredSetting = (name, value) => {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    throw new Error(`Missing required build setting: ${name}`);
  }

  return normalizedValue;
};

const requiredUrl = (name, value) =>
  requiredSetting(name, value).replace(/\/+$/, "");

export const LOGIN_BASE_URL = requiredUrl(
  "VITE_LOGIN_BASE_URL",
  import.meta.env.VITE_LOGIN_BASE_URL
);

export const PUBLIC_SITE_URL = requiredUrl(
  "VITE_PUBLIC_SITE_URL",
  import.meta.env.VITE_PUBLIC_SITE_URL
);

export const PUBLIC_SITE_LABEL = requiredSetting(
  "VITE_PUBLIC_SITE_LABEL",
  import.meta.env.VITE_PUBLIC_SITE_LABEL
);

export const TRIVIA_SITE_URL = requiredUrl(
  "VITE_TRIVIA_SITE_URL",
  import.meta.env.VITE_TRIVIA_SITE_URL
);

export const TRIVIA_SITE_LABEL = requiredSetting(
  "VITE_TRIVIA_SITE_LABEL",
  import.meta.env.VITE_TRIVIA_SITE_LABEL
);
