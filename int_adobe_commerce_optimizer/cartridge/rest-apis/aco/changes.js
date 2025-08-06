const RESTResponseMgr = require("dw/system/RESTResponseMgr");
const ProductMgr = require("dw/catalog/ProductMgr");
const CustomObjectMgr = require("dw/object/CustomObjectMgr");
const Logger = require("dw/system/Logger");

const logger = Logger.getLogger("aco", "aco_tracked_changes");

const TRACKED_CHANGES_CUSTOM_OBJECT = "AcoTrackedChanges";

exports.getAcoTrackedChanges = function () {
  const siteId = request.httpParameterMap.siteId.value;
  const locale = request.httpParameterMap.locale.value;
  const limit = Number(request.httpParameterMap.c_limit.value) || 100;
  const offset = Number(request.httpParameterMap.c_offset.value) || 0;
  const type = request.httpParameterMap.c_type.value;
  const since = request.httpParameterMap.c_since.value;

  let filter = "custom.siteId = {0}";
  let filterValues = [siteId];
  if (type && since) {
    filter += " and custom.type = {1} and lastModified >= {2}";
    filterValues.push(type, since);
  } else if (type) {
    filter += " and custom.type = {1}";
    filterValues.push(type);
  } else if (since) {
    filter += " and lastModified >= {1}";
    filterValues.push(since);
  }

  const changes = [];
  const iterator = CustomObjectMgr.queryCustomObjects(
    TRACKED_CHANGES_CUSTOM_OBJECT,
    filter,
    "lastModified ASC",
    filterValues
  );

  const records = iterator.asList(offset, limit).toArray();

  records.forEach((record) => {
    changes.push({
      id: record.custom.ID,
      deltaExportFile: record.custom.deltaExportFile,
      entityId: record.custom.entityId,
      siteId: record.custom.siteId,
      priceBookId: record.custom.priceBookId,
      type: record.custom.type,
      isDeleted: record.custom.isDeleted,
      lastModified: record.lastModified,
    });
  });

  const response = {
    total: iterator.getCount(),
    limit: limit,
    offset: offset,
    pageSize: records.length,
    data: changes,
  };

  iterator.close();

  RESTResponseMgr.createSuccess(response).render();
};

exports.getAcoTrackedChanges.public = true;
