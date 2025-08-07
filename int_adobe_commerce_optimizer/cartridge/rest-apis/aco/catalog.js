const RESTResponseMgr = require("dw/system/RESTResponseMgr");
const CatalogMgr = require("dw/catalog/CatalogMgr");
const Logger = require("dw/system/Logger");

const logger = Logger.getLogger("aco", "aco_catalog");

exports.getSiteCatalog = function () {
  const siteCatalog = CatalogMgr.getSiteCatalog();

  if (!siteCatalog) {
    RESTResponseMgr.createError(
      404,
      "site-catalog-not-found",
      "Site catalog not found",
      "A catalog has not been assigned to this site."
    ).render();
    return;
  }

  const response = {
    id: siteCatalog.getID(),
    displayName: siteCatalog.getDisplayName(),
    description: siteCatalog.getDescription(),
    creationDate: siteCatalog.getCreationDate()
      ? siteCatalog.getCreationDate().toISOString()
      : null,
    lastModified: siteCatalog.getLastModified()
      ? siteCatalog.getLastModified().toISOString()
      : null,
  };

  RESTResponseMgr.createSuccess(response).render();
};

exports.getSiteCatalog.public = true;
