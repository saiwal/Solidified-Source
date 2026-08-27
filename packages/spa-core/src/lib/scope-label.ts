/**
 * Human label for a public_policy scope, in the viewer's locale.
 *
 * Mirrors core's translate_scope() (include/items.php:1282) case for case, but
 * resolved client-side: core translates into the *channel's* language, which
 * is not necessarily the language this viewer picked.
 *
 * Kept free of imports so scope-label.test.ts can run under plain node.
 */
export function scopeLabel(
  scope: string,
  t: (key: string, params?: Record<string, string>) => string,
): string {
  if (!scope || scope === "public")         return t("share.scope_public");
  if (scope.startsWith("self"))             return t("share.scope_self");
  if (scope.startsWith("network:"))         return t("share.scope_network");
  if (scope.startsWith("authenticated"))    return t("share.scope_authenticated");
  if (scope.startsWith("site:"))            return t("share.scope_site", { site: scope.slice(5) });
  if (scope.startsWith("any connections"))  return t("share.scope_connections");
  if (scope.startsWith("contacts"))         return t("share.scope_contacts");
  if (scope.startsWith("specific"))         return t("share.scope_specific");
  // Fall through and show the untranslated scope, as core does.
  return scope;
}
