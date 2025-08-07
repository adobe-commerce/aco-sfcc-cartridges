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
const PricebookMgr = require("dw/catalog/PriceBookMgr");
const Logger = require("dw/system/Logger");

const logger = Logger.getLogger("aco", "aco_pricebooks");

const MAX_LIMIT = 100;

exports.getAllPriceBooks = function () {
  const limit = Number(request.httpParameterMap.c_limit.value) || MAX_LIMIT;
  const offset = Number(request.httpParameterMap.c_offset.value) || 0;

  const priceBooks = PricebookMgr.getSitePriceBooks().toArray(offset, limit);

  const response = {
    total: priceBooks.length,
    limit: limit,
    offset: offset,
    data: priceBooks.map((priceBook) => ({
      id: priceBook.ID,
      displayName: priceBook.displayName,
      description: priceBook.description,
      currencyCode: priceBook.currencyCode,
      online: priceBook.online,
      onlineFlag: priceBook.onlineFlag,
      onlineFrom: priceBook.onlineFrom,
      onlineTo: priceBook.onlineTo,
      creationDate: priceBook.getCreationDate()
        ? priceBook.getCreationDate().toISOString()
        : null,
      lastModified: priceBook.getLastModified()
        ? priceBook.getLastModified().toISOString()
        : null,
      parentPriceBook: priceBook.parentPriceBook
        ? {
            id: priceBook.parentPriceBook.ID,
            displayName: priceBook.parentPriceBook.displayName,
          }
        : null,
    })),
  };

  RESTResponseMgr.createSuccess(response).render();
};

exports.getPriceBookById = function () {
  const priceBookId = request.getSCAPIPathParameters().get("priceBookId");

  const priceBook = PricebookMgr.getPriceBook(priceBookId);

  logger.error("Price book: " + priceBook);

  if (priceBook == null) {
    RESTResponseMgr.createError(
      404,
      "pricebook-not-found",
      "Price book not found",
      "You provided an unknown price book ID."
    ).render();
    return;
  }

  const response = {
    id: priceBook.ID,
    displayName: priceBook.displayName,
    description: priceBook.description,
    currencyCode: priceBook.currencyCode,
    online: priceBook.online,
    onlineFlag: priceBook.onlineFlag,
    onlineFrom: priceBook.onlineFrom,
    onlineTo: priceBook.onlineTo,
    creationDate: priceBook.getCreationDate()
      ? priceBook.getCreationDate().toISOString()
      : null,
    lastModified: priceBook.getLastModified()
      ? priceBook.getLastModified().toISOString()
      : null,
    parentPriceBook: priceBook.parentPriceBook
      ? {
          id: priceBook.parentPriceBook.ID,
          displayName: priceBook.parentPriceBook.displayName,
        }
      : null,
  };

  RESTResponseMgr.createSuccess(response).render();
};

exports.getAllPriceBooks.public = true;
exports.getPriceBookById.public = true;
