/**
 * Copyright 2025 Adobe. All Rights Reserved.
 *
 * This file is licensed to you under the Apache License, Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on
 * an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS OF ANY KIND, either express or implied. See the License for
 * the specific language governing permissions and limitations under the License.
 */

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
