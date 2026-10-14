// The header (title, Articles | Series switcher, search, New article) and the
// article list are widgets registered in ../index.ts (header / contentTop
// slots). The header also shows on the series index; the list only on the
// list route (see ../lib/isArticlesList.ts), since the module's other routes
// render their own content here instead.
export default function ArticlesView() {
  return null;
}
