"use strict";
var cuti = require("cuti");
var util = require("util");
var http = require("http");
var Mongoose = require("mongoose");
var SMCrud = require("swagger-mongoose-crud");
var puttu = require("puttu-redis");
// var url = process.env.MONGO_URL ? process.env.MONGO_URL : "mongodb://localhost/storeKing";
var log4js = require("cuti").logger.getLogger;
var logger = process.env.PROD_ENV ? log4js.getLogger("reports") : log4js.getLogger("reports-dev");
var elasticsearch = require('elasticsearch');
var elasticClient = new elasticsearch.Client({
    host: 'localhost:9200',
    log: 'info'
});
var exportTemplateController = require("./exportTemplate.controller.js");
var exportTemplateDefinition = require("../helpers/exportReportTemplate.helper.js").exportReporttemplate;
var collection = "exporttemplate";
var schema = new Mongoose.Schema(exportTemplateDefinition);
var crudder = new SMCrud(schema, collection, logger);
var downloadController = require("./downloadReport.controller");
var reportLogDefinition = require("../helpers/reportLogger.js").reportLog;
var reportLogSchema = new Mongoose.Schema(reportLogDefinition);
var reportLogcrudder = new SMCrud(reportLogSchema, "reportlogs", logger);
exportTemplateController.init(crudder);
downloadController.init(logger, cuti, crudder, reportLogcrudder);
puttu.connect();

schema.pre("save", function (next) {
    logger.info("ID generation");
    if (!this._id) {
        cuti.counter.getCount("ExportTemplateId", null, (err, doc) => {
            this._id = "ETE" + doc.next;
            next();
        });
    } else {
        next();
    }
});

module.exports.v1_templateCreate = exportTemplateController.templateCreate;
module.exports.v1_fetchTemplate = crudder.index;
module.exports.v1_templateDelete = exportTemplateController.templateDelete;
module.exports.v1_getTemplateById = exportTemplateController.templatebyId;
module.exports.v1_updateTemplate = exportTemplateController.updateTemplate;
module.exports.v1_count = crudder.count;
module.exports.v1_reportdownload = downloadController.reportdownload;
module.exports.v1_getAllReportForAssignedUser = downloadController.getAllReportForAssignedUser;
module.exports.v1_getReportLogs = reportLogcrudder.index;
module.exports.v1_getReportLogsCount = reportLogcrudder.count;
// module.exports.v1_queryTest=downloadController.queryTest;