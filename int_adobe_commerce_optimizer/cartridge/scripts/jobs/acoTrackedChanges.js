const ArrayList = require("dw/util/ArrayList");
const CustomObjectMgr = require("dw/object/CustomObjectMgr");
const File = require("dw/io/File");
const FileReader = require("dw/io/FileReader");
const Logger = require("dw/system/Logger");
const Site = require("dw/system/Site");
const Status = require("dw/system/Status");
const Transaction = require("dw/system/Transaction");
const Encoding = require("dw/crypto/Encoding");
const Bytes = require("dw/util/Bytes");
const XMLStreamConstants = require("dw/io/XMLStreamConstants");
const XMLStreamReader = require("dw/io/XMLStreamReader");

const logger = Logger.getLogger("aco", "aco_tracked_changes_job");

const TRACKED_CHANGES_CUSTOM_OBJECT = "AcoTrackedChanges";

const siteId = Site.getCurrent().getID();
const trackedChanges = new ArrayList();
let trackedChangesIterator;

/**
 * Recursively deletes a directory and all its contents.
 * @param {dw.io.File} dir - The directory to delete.
 * @returns {void}
 */
function deleteDirRecursively(dir) {
  if (dir.exists() && dir.isDirectory()) {
    const files = dir.listFiles().toArray();
    files.forEach((file) => {
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
      "No UUID directory found in " +
        zipFile.getFullPath() +
        ". Nothing to process."
    );
    return [];
  }

  const priceBookDir = new File(uuidDir, "pricebooks");
  if (priceBookDir.exists() && priceBookDir.isDirectory()) {
    // Get all price book files in the 000001/{uuid}/pricebooks/ directory
    const priceBookFiles = priceBookDir.listFiles().toArray();
    priceBookFiles.forEach((priceBookFile) => {
      if (priceBookFile.exists()) {
        logger.info(
          "Processing price book XML file: " + priceBookFile.getFullPath()
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
      "No UUID directory found in " +
        zipFile.getFullPath() +
        ". Nothing to process."
    );
    return [];
  }

  const catalogDir = new File(uuidDir, "catalogs");
  if (catalogDir.exists() && catalogDir.isDirectory()) {
    const catalogChildDirs = getChildDirs(catalogDir);
    // Get all child directories in the 000001/{uuid}/catalogs/ directory
    catalogChildDirs.forEach((childDir) => {
      // Get the catalog.xml file in the child (catalogId) directory
      const catalogXml = new File(childDir, "catalog.xml");
      if (catalogXml.exists()) {
        logger.info("Processing catalog XML file: " + catalogXml.getFullPath());
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
  logger.info("Extracting delta export files");

  const consumer = parameters.consumer;
  const deltaExportJobName = parameters.deltaExportJobName;
  const deltaExportPath = `${File.IMPEX}/src/platform/outbox/${consumer}/${deltaExportJobName}`;
  logger.info("Consumer: " + consumer);
  logger.info("Delta Export Job Name: " + deltaExportJobName);
  logger.info("Delta Export Path: " + deltaExportPath);

  let deltaExportDir = new File(deltaExportPath);
  if (!deltaExportDir.exists()) {
    logger.info(
      "Delta export directory does not exist: " +
        deltaExportDir.getFullPath() +
        ". No changes to process."
    );
    return;
  }

  const deltaExportFiles = deltaExportDir
    .list()
    .filter((file) => file.match(/^\d{6}\.zip$/))
    .sort();
  if (deltaExportFiles.length === 0) {
    logger.info(
      "No delta export files found in " +
        deltaExportDir.getFullPath() +
        ". No changes to process."
    );
    return;
  }

  logger.info(
    "Found " + deltaExportFiles.length + " delta export files to process."
  );

  let tempDir = new File(deltaExportDir, "_aco_temp");
  try {
    if (tempDir.exists()) {
      deleteDirRecursively(tempDir);
    }
    tempDir.mkdir();
    deltaExportFiles.forEach((file) => {
      logger.info("Processing delta export file: " + file);

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
    logger.error("Error processing delta export files: " + error.message);
    return;
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
  return trackedChanges.size();
};

/**
 * steptypes.json read-function
 * Extracts changes from delta export files.
 * @param {dw.util.HashMap} parameters - Job step parameters.
 * @param {dw.job.JobStepExecution} stepExecution - The step execution object.
 */
exports.read = function (parameters, stepExecution) {
  if (trackedChangesIterator.hasNext()) {
    return trackedChangesIterator.next();
  }
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
    logger.info("Change record is empty, skipping process function.");
    return;
  }

  logger.debug("Saving change record: " + changeRecord.entityId);
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
            "Skipping change record " +
              changeRecord.entityId +
              " - already processed from delta export file: " +
              changeRecord.deltaExportFile
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
    logger.error("Error processing " + customObjectID + ": " + error.message);
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
    return new Status(Status.ERROR, "Job failed");
  }
  return new Status(Status.OK, "Job completed successfully");
};
