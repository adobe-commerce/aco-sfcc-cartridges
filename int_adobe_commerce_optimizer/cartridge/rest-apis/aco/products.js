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
const ProductMgr = require("dw/catalog/ProductMgr");
const PriceBookMgr = require("dw/catalog/PriceBookMgr");
const ObjectAttributeDefinition = require("dw/object/ObjectAttributeDefinition");
const Logger = require("dw/system/Logger");

const logger = Logger.getLogger("aco", "aco_products");

const MAX_IDS_PER_REQUEST = 100;
const IMAGE_VIEW_TYPES = ["thumbnail", "small", "medium", "large"];

function getPricesPerPriceBook(product, priceBooks) {
  const prices = [];
  const priceModel = product.getPriceModel();
  if (priceModel) {
    priceBooks.forEach((priceBook) => {
      const price = priceModel.getPriceBookPrice(priceBook.ID);
      if (price && price.available) {
        prices.push({
          priceBookId: priceBook.ID,
          price: price.value,
        });
      }
    });
  }
  return prices;
}

function getCustomAttributes(product) {
  const attributes = [];
  const attributeModel = product.getAttributeModel();
  if (attributeModel) {
    const attributeGroups = attributeModel.getAttributeGroups().toArray();
    attributeGroups.forEach((attributeGroup) => {
      const attributeDefinitions = attributeGroup
        .getAttributeDefinitions()
        .toArray();
      attributeDefinitions
        .filter((attribute) => !attribute.isSystem())
        .forEach((attribute) => {
          const attributeValue = product.custom[attribute.ID];
          const isEnumType =
            attribute.getValueTypeCode() ===
              ObjectAttributeDefinition.VALUE_TYPE_ENUM_OF_STRING ||
            attribute.getValueTypeCode() ===
              ObjectAttributeDefinition.VALUE_TYPE_ENUM_OF_INT;

          let values = [];
          if (attributeValue !== null && attributeValue !== undefined) {
            if (attribute.isMultiValueType()) {
              const valueArray = Array.isArray(attributeValue)
                ? attributeValue
                : [attributeValue];
              values = valueArray.map((item) =>
                isEnumType ? item.getValue() : item
              );
            } else {
              values = [
                isEnumType ? attributeValue.getValue() : attributeValue,
              ];
            }
          }

          if (values.length > 0) {
            attributes.push({
              id: attribute.getID(),
              values: values,
            });
          }
        });
    });
  }
  return attributes;
}

function getImages(product) {
  const images = [];
  IMAGE_VIEW_TYPES.forEach((viewType) => {
    const imageModel = product.getImages(viewType).toArray();
    if (imageModel) {
      imageModel.forEach((image) => {
        const imageData = {
          viewType: image.getViewType(),
          title: image.getTitle(),
          alt: image.getAlt(),
          url: image.getURL().toString(),
          absUrl: image.getAbsURL().toString(),
        };
        images.push(imageData);
      });
    }
  });
  return images;
}

function getProductType(product) {
  if (product.isMaster()) return "MASTER";
  else if (product.isVariant()) return "VARIANT";
  else if (product.isVariationGroup()) return "VARIATION_GROUP";
  else if (product.isBundle()) return "BUNDLE";
  else if (product.isBundled()) return "BUNDLED";
  else if (product.isProductSet()) return "PRODUCT_SET";
  else if (product.isProductSetProduct()) return "PRODUCT_SET_PRODUCT";
  else return "SIMPLE";
}

function getVariationAttributes(product) {
  let variationAttributes = [];
  if (product.variationModel) {
    const attrs = product.variationModel.getProductVariationAttributes().toArray();
    if (attrs.length > 0) {
      variationAttributes = attrs.map(attr => ({
        id: attr.getID(),
        attributeId: attr.getAttributeID(),
        name: attr.getDisplayName(),
        values: product.variationModel.getAllValues(attr).toArray().map(val => ({
          description: val.getDescription(),
          name: val.getDisplayValue(),
          value: val.getValue()
        })),
      }));
    }
  }
  return variationAttributes;
}

function getVariantsForMasterProduct(product) {
  if (!product.isMaster()) {
    return [];
  }
  return product.getVariants().toArray().map(variant => {
    const variationValues = getVariationValuesForVariant(variant);
    return {
      productId: variant.getID(),
      variationValues: variationValues
    };
  });
}

function getVariationValuesForVariant(product) {
  const variationValues = {};
  if (product.variationModel) {
    const attrs = product.variationModel.getProductVariationAttributes().toArray();
    attrs.forEach(attr => {
      const val = product.variationModel.getVariationValue(product, attr);
      variationValues[attr.getID()] = val ? val.getValue() : null;
   });
  }
  return variationValues;
}

function getMasterInfoForVariant(product) {
  const masterProduct = product.variationModel.getMaster();
  return masterProduct ? {
    id: masterProduct.getID(),
  } : null;
}

function getBundledProducts(product) {
  if (!product.isBundle()) {
    return [];
  }
  return product.getBundledProducts().toArray().map(bundledProduct => ({
    id: bundledProduct.getID(),
    name: bundledProduct.getName(),
    quantity: product.getBundledProductQuantity(bundledProduct).getValue()
  }));
}

function getBundles(product) {
  if (!product.isBundled()) {
    return [];
  }
  return product.getBundles().toArray().map(bundle => bundle.getID());
}

exports.getProducts = function () {
  const requestBody = JSON.parse(request.httpParameterMap.requestBodyAsString);
  const ids = requestBody.ids;

  logger.info("getProducts called with ids: {0}", ids);

  // Validate input
  if (!ids || !Array.isArray(ids)) {
    RESTResponseMgr.createError(
      400,
      "Invalid request",
      "IDs must be provided as an array"
    ).render();
    return;
  }

  if (ids.length === 0) {
    RESTResponseMgr.createError(
      400,
      "Invalid request",
      "At least one ID must be provided"
    ).render();
    return;
  }

  if (ids.length > MAX_IDS_PER_REQUEST) {
    RESTResponseMgr.createError(
      400,
      "Invalid request",
      "Maximum 100 IDs allowed per request"
    ).render();
    return;
  }

  const products = [];
  const priceBooks = PriceBookMgr.getAllPriceBooks().toArray();

  ids.forEach((id) => {
    try {
      const product = ProductMgr.getProduct(id);

      if (!product) {
        logger.warn("Product not found for ID: {0}", id);
        return;
      }

      const productData = {
        id: product.getID(),
        locale: request.httpParameterMap.locale.value,
        name: product.getName(),
        shortDescription: product.getShortDescription().toString(),
        longDescription: product.getLongDescription().toString(),
        pageTitle: product.getPageTitle(),
        pageDescription: product.getPageDescription(),
        pageKeywords: product.getPageKeywords(),
        brand: product.getBrand(),
        manufacturerSku: product.getManufacturerSKU(),
        manufacturerName: product.getManufacturerName(),
        online: product.isOnline(),
        onlineFlag: product.getOnlineFlag(),
        searchable: product.isSearchable(),
        searchableFlag: product.getSearchableFlag(),
        inStock: product.getAvailabilityModel().isInStock(),
        prices: getPricesPerPriceBook(product, priceBooks),
        customAttributes: getCustomAttributes(product),
        images: getImages(product),
        creationDate: product.getCreationDate().toISOString(),
        lastModified: product.getLastModified().toISOString(),
        type: getProductType(product),
        variationAttributes: getVariationAttributes(product)
      };
      if (product.isMaster()) {
        productData.variants = getVariantsForMasterProduct(product);
      } else if (product.isVariant()) {
        productData.variationValues = getVariationValuesForVariant(product);
        productData.master = getMasterInfoForVariant(product);
      } else if (product.isBundle()) {
          productData.bundledProducts = getBundledProducts(product);
      } else if (product.isBundled()) {
        productData.bundles = getBundles(product);
      }
      products.push(productData);
    } catch (e) {
      logger.error(
        "Error processing product ID: {0}, error: {1}",
        id,
        e.message
      );
      return;
    }
  });

  const response = {
    count: products.length,
    data: products,
  };

  logger.info(
    "getProducts completed successfully. Returned {0} products out of {1} requested",
    products.length,
    ids.length
  );
  RESTResponseMgr.createSuccess(response).render();
};

exports.getProducts.public = true;
