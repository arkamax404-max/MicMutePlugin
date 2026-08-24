function normalizeText(text) {
  return text.replace(/\r\n?/g, "\n").trimEnd();
}

export function includesCompleteLicense(notice, license) {
  const normalizedLicense = normalizeText(license);
  return normalizedLicense.length > 0 && normalizeText(notice).includes(normalizedLicense);
}
