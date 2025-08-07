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

const ArrayList = require("dw/util/ArrayList");
const Bytes = require("dw/util/Bytes");
const CatalogMgr = require("dw/catalog/CatalogMgr");
const CustomObjectMgr = require("dw/object/CustomObjectMgr");
const Encoding = require("dw/crypto/Encoding");
const File = require("dw/io/File");
const FileReader = require("dw/io/FileReader");
const Logger = require("dw/system/Logger");
const PricebookMgr = require("dw/catalog/PriceBookMgr");
const Site = require("dw/system/Site");
const Status = require("dw/system/Status");
const Transaction = require("dw/system/Transaction");
const XMLStreamConstants = require("dw/io/XMLStreamConstants");
const XMLStreamReader = require("dw/io/XMLStreamReader");

const logger = Logger.getLogger("aco", "aco_tracked_changes_job");

const TRACKED_CHANGES_CUSTOM_OBJECT = "AcoTrackedChanges";

const siteId = Site.getCurrent().getID();
const trackedChanges = new ArrayList();
let trackedChangesIterator = new ArrayList().iterator();

/**
 * Recursively deletes a directory and all its contents.
 * @param {dw.io.File} dir - The directory to delete.
 * @returns {void}
 */
function deleteDirRecursively(dir) {
  if (dir.exists() && dir.isDirectory()) {
    const files = dir.listFiles();
    if (!files) {
      logger.info(
        `[${siteId}] [deleteDirRecursively] No files found in ${dir.getFullPath()}. Nothing to delete.`
      );
      return;
    }
    files.toArray().forEach((file) => {
      if (file.isDirectory()) {
        deleteDirRecursively(file);
      } else {
        file.remove();
      }
    });
    dir.remove();
  }
}

/**
 * Returns all child directories of a parent directory, sorted alphabetically.
 * @param {dw.io.File} parentDir - The parent directory.
 * @returns {Array} - The child directories, sorted alphabetically.
 */
function getChildDirs(parentDir) {
  if (empty(parentDir) || !parentDir.isDirectory()) {
    return [];
  }
  return parentDir
    .listFiles((file) => file.isDirectory())
    .toArray()
    .sort();
}

/**
 * Extracts price book changes from a zip file.
 * Zip file extracts to: 000001/{uuid}/pricebooks/{priceBookId}.xml
 * @param {dw.io.File} zipFile - The zip file to extract changes from (ie. 000001.zip).
 * @returns {Array} - List of change record objects.
 */
function extractPriceBookChanges(zipFile) {
  const changes = [];
  const deltaExportFileName = zipFile.getName().replace(".zip", "");
  const files = zipFile.listFiles().toArray();
  const uuidDir = files.find((file) => file.isDirectory());
  if (!uuidDir) {
    logger.error(
      `[${siteId}] [extractPriceBookChanges] No UUID directory found in ${zipFile.getFullPath()}. Nothing to process.`
    );
    return [];
  }

  // Get all price books for the current site
  const sitePriceBooks = PricebookMgr.getSitePriceBooks().toArray();
  const sitePriceBookIds = sitePriceBooks.map((priceBook) => priceBook.ID);
  logger.info(
    `[${siteId}] [extractPriceBookChanges] Site price book IDs: ${sitePriceBookIds}`
  );

  const priceBookDir = new File(uuidDir, "pricebooks");
  if (priceBookDir.exists() && priceBookDir.isDirectory()) {
    // Get all price book files in the 000001/{uuid}/pricebooks/ directory
    const priceBookFiles = priceBookDir.listFiles().toArray();
    priceBookFiles.forEach((priceBookFile) => {
      // Skip if the price book does not apply to the current site
      let priceBookFileName = priceBookFile.getName().replace(".xml", "");
      if (!sitePriceBookIds.includes(priceBookFileName)) {
        logger.info(
          `[${siteId}] [extractPriceBookChanges] Price Book ${priceBookFileName} does not apply to the current site: ${siteId}. Skipping...`
        );
        return;
      }

      if (priceBookFile.exists()) {
        logger.info(
          `[${siteId}] [extractPriceBookChanges] Processing price book XML file: ${priceBookFile.getFullPath()}`
        );
        const fileReader = new FileReader(priceBookFile);
        const xmlStreamReader = new XMLStreamReader(fileReader);
        while (xmlStreamReader.hasNext()) {
          let mode;
          let priceBookId;
          let isDeleted;
          if (xmlStreamReader.next() === XMLStreamConstants.START_ELEMENT) {
            if (xmlStreamReader.getLocalName() === "header") {
              priceBookId = xmlStreamReader.getAttributeValue(
                null,
                "pricebook-id"
              );
              mode = xmlStreamReader.getAttributeValue(null, "mode");
              isDeleted = mode === "delete";
              changes.push({
                deltaExportFile: deltaExportFileName,
                entityId: priceBookId,
                type: "priceBook",
                isDeleted,
                priceBookId,
              });
            } else if (xmlStreamReader.getLocalName() === "price-table") {
              let productId = xmlStreamReader.getAttributeValue(
                null,
                "product-id"
              );
              mode = xmlStreamReader.getAttributeValue(null, "mode");
              isDeleted = mode === "delete";
              changes.push({
                deltaExportFile: deltaExportFileName,
                entityId: productId,
                type: "price",
                isDeleted,
                priceBookId,
              });
            }
          }
        }
        xmlStreamReader.close();
        fileReader.close();
      }
    });
  }

  return changes;
}

/**
 * Extracts catalog changes from a zip file.
 * Zip file extracts to: 000001/{uuid}/catalogs/{catalogId}/catalog.xml
 * @param {dw.io.File} zipFile - The zip file to extract changes from (ie. 000001.zip).
 * @returns {Array} - List of change record objects.
 */
function extractCatalogChanges(zipFile) {
  const changes = [];
  const deltaExportFileName = zipFile.getName().replace(".zip", "");
  const files = zipFile.listFiles().toArray();
  const uuidDir = files.find((file) => file.isDirectory());
  if (!uuidDir) {
    logger.error(
      `[${siteId}] [extractCatalogChanges] No UUID directory found in ${zipFile.getFullPath()}. Nothing to process.`
    );
    return [];
  }

  // Get the catalog for the current site
  const siteCatalog = CatalogMgr.getSiteCatalog();
  if (!siteCatalog) {
    logger.info(
      `[${siteId}] [extractCatalogChanges] No site catalog found for site: ${siteId}. Nothing to process.`
    );
    return [];
  }
  logger.info(
    `[${siteId}] [extractCatalogChanges] Site catalog ID: ${siteCatalog.ID}`
  );

  const catalogDir = new File(uuidDir, "catalogs");
  if (catalogDir.exists() && catalogDir.isDirectory()) {
    const catalogChildDirs = getChildDirs(catalogDir);
    // Get all child directories in the 000001/{uuid}/catalogs/ directory
    catalogChildDirs.forEach((childDir) => {
      // Skip if the catalog does not apply to the current site
      if (childDir.getName() !== siteCatalog.ID) {
        logger.info(
          `[${siteId}] [extractCatalogChanges] Catalog ${childDir.getName()} does not apply to the current site: ${siteId}. Skipping...`
        );
        return;
      }
      // Get the catalog.xml file in the child (catalogId) directory
      const catalogXml = new File(childDir, "catalog.xml");
      if (catalogXml.exists()) {
        logger.info(
          `[${siteId}] [extractCatalogChanges] Processing catalog XML file: ${catalogXml.getFullPath()}`
        );
        const fileReader = new FileReader(catalogXml);
        const xmlStreamReader = new XMLStreamReader(fileReader);
        while (xmlStreamReader.hasNext()) {
          if (xmlStreamReader.next() === XMLStreamConstants.START_ELEMENT) {
            if (xmlStreamReader.getLocalName() === "product") {
              let productId = xmlStreamReader.getAttributeValue(
                null,
                "product-id"
              );
              let mode = xmlStreamReader.getAttributeValue(null, "mode");
              let isDeleted = mode === "delete";
              changes.push({
                deltaExportFile: deltaExportFileName,
                entityId: productId,
                type: "product",
                isDeleted,
                priceBookId: null,
              });
            }
          }
        }
        xmlStreamReader.close();
        fileReader.close();
      }
    });
  }

  return changes;
}

/**
 * steptypes.json before-step-function
 * Extracts changes from delta export files.
 * @param {dw.util.HashMap} parameters - Job step parameters.
 * @param {dw.job.JobStepExecution} stepExecution - The step execution object.
 */
exports.beforeStep = function (parameters, stepExecution) {
  logger.info(`[${siteId}] [beforeStep] Extracting delta export files`);

  const consumer = parameters.consumer;
  const deltaExportJobName = parameters.deltaExportJobName;
  const deltaExportPath = `${File.IMPEX}/src/platform/outbox/${consumer}/${deltaExportJobName}`;
  logger.info(`[${siteId}] [beforeStep] Consumer: ${consumer}`);
  logger.info(
    `[${siteId}] [beforeStep] Delta Export Job Name: ${deltaExportJobName}`
  );
  logger.info(`[${siteId}] [beforeStep] Delta Export Path: ${deltaExportPath}`);

  let deltaExportDir = new File(deltaExportPath);
  if (!deltaExportDir.exists()) {
    logger.info(
      `[${siteId}] [beforeStep] Delta export directory does not exist: ${deltaExportDir.getFullPath()}. No changes to process.`
    );
    return;
  }

  const deltaExportFiles = deltaExportDir
    .list()
    .filter((file) => file.match(/^\d{6}\.zip$/))
    .sort();
  if (deltaExportFiles.length === 0) {
    logger.info(
      `[${siteId}] [beforeStep] No delta export files found in ${deltaExportDir.getFullPath()}. No changes to process.`
    );
    return;
  }

  logger.info(
    `[${siteId}] [beforeStep] Found ${deltaExportFiles.length} delta export files to process.`
  );

  let tempDir = new File(deltaExportDir, `_aco_temp_${siteId}`);
  try {
    if (tempDir.exists()) {
      deleteDirRecursively(tempDir);
    }
    tempDir.mkdir();
    deltaExportFiles.forEach((file) => {
      logger.info(
        `[${siteId}] [beforeStep] Processing delta export file: ${file}`
      );

      let currentFile = new File(deltaExportDir, file);
      let currentTempDir = new File(
        tempDir,
        currentFile.getName().replace(".zip", "")
      );
      currentFile.unzip(currentTempDir);
      const catalogChanges = extractCatalogChanges(currentTempDir);
      const priceBookChanges = extractPriceBookChanges(currentTempDir);
      trackedChanges.push(catalogChanges);
      trackedChanges.push(priceBookChanges);

      deleteDirRecursively(currentTempDir);
    });
    trackedChangesIterator = trackedChanges.iterator();
  } catch (error) {
    logger.error(
      `[${siteId}] [beforeStep] Error processing delta export files: ${error.message}`
    );
    throw error;
  } finally {
    deleteDirRecursively(tempDir);
  }
};

/**
 * steptypes.json total-count-function
 * Extracts changes from delta export files.
 * @param {dw.util.HashMap} parameters - Job step parameters.
 * @param {dw.job.JobStepExecution} stepExecution - The step execution object.
 */
exports.getTotalCount = function (parameters, stepExecution) {
  const totalCount = trackedChanges.size();
  logger.info(
    `[${siteId}] [getTotalCount] Total changes to process: ${totalCount}`
  );
  return totalCount;
};

/**
 * steptypes.json read-function
 * Extracts changes from delta export files.
 * @param {dw.util.HashMap} parameters - Job step parameters.
 * @param {dw.job.JobStepExecution} stepExecution - The step execution object.
 */
exports.read = function (parameters, stepExecution) {
  if (trackedChangesIterator && trackedChangesIterator.hasNext()) {
    return trackedChangesIterator.next();
  }
  logger.info(`[${siteId}] [read] No more changes to process.`);
  return null;
};

/**
 * steptypes.json process-function
 * Extracts changes from delta export files.
 * @param {Object} changeRecord - The change record object to process.
 * @param {dw.util.HashMap} parameters - Job step parameters.
 * @param {dw.job.JobStepExecution} stepExecution - The step execution object.
 */
exports.process = function (changeRecord, parameters, stepExecution) {
  if (!changeRecord || !changeRecord.entityId) {
    logger.info(
      `[${siteId}] [process] Change record is empty, skipping process function.`
    );
    return;
  }

  logger.debug(
    `[${siteId}] [process] Saving change record: ${changeRecord.entityId}`
  );
  const idString = `${changeRecord.deltaExportFile}_${siteId}_${changeRecord.type}_${changeRecord.entityId}_${changeRecord.priceBookId}`;
  const customObjectID = Encoding.toBase64(new Bytes(idString, "UTF-8"));
  try {
    Transaction.wrap(function () {
      let currentChangeRecord = CustomObjectMgr.getCustomObject(
        TRACKED_CHANGES_CUSTOM_OBJECT,
        customObjectID
      );

      let shouldUpdate = false;
      if (!currentChangeRecord) {
        // Create new record if it doesn't exist
        currentChangeRecord = CustomObjectMgr.createCustomObject(
          TRACKED_CHANGES_CUSTOM_OBJECT,
          customObjectID
        );
        shouldUpdate = true;
      } else {
        // Only update if this change hasn't been processed from this delta export file
        shouldUpdate =
          currentChangeRecord.custom.deltaExportFile !==
          changeRecord.deltaExportFile;
        if (!shouldUpdate) {
          logger.debug(
            `[${siteId}] [process] Skipping change record ${changeRecord.entityId} - already processed from delta export file: ${changeRecord.deltaExportFile}`
          );
        }
      }

      if (shouldUpdate) {
        currentChangeRecord.custom.entityId = changeRecord.entityId;
        currentChangeRecord.custom.siteId = siteId;
        currentChangeRecord.custom.priceBookId = changeRecord.priceBookId;
        currentChangeRecord.custom.type = changeRecord.type;
        currentChangeRecord.custom.isDeleted = changeRecord.isDeleted;
        currentChangeRecord.custom.deltaExportFile =
          changeRecord.deltaExportFile;
      }
    });
  } catch (error) {
    logger.error(
      `[${siteId}] [process] Error processing ${customObjectID}: ${error.message}`
    );
  }
};

/**
 * steptypes.json write-function
 * Required for steptypes.json but not used in this job.
 * @param {Object} changeRecords - The change records to write.
 * @param {dw.util.HashMap} parameters - Job step parameters.
 * @param {dw.job.JobStepExecution} stepExecution - The step execution object.
 */
exports.write = function (changeRecords, parameters, stepExecution) {};

/**
 * steptypes.json after-step-function
 * @param {boolean} success - Whether the step succeeded.
 * @param {dw.util.HashMap} parameters - Job step parameters.
 * @param {dw.job.JobStepExecution} stepExecution - The step execution object.
 */
exports.afterStep = function (success, parameters, stepExecution) {
  if (!success) {
    return new Status(Status.ERROR, `[${siteId}] [afterStep] Job failed`);
  }
  return new Status(
    Status.OK,
    `[${siteId}] [afterStep] Job completed successfully`
  );
};
