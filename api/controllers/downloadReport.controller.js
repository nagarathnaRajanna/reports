/*globals require, module */
var http = require("http"),
    fs = require("fs"),
    _ = require("lodash"),
    request = require("request"),
    logger,
    cuti,
    crudder,
    json2xml = require("json2xml"),
    dbConnector = require("../helpers/util");
var MD5 = require("md5.js");
var Excel = require("exceljs");
var reportLogCrudder;
var Parser = require("expr-eval").Parser;
var json2csv = require("json2csv");
var url = process.env.MONGO_URL ? process.env.MONGO_URL : "mongodb://localhost/storeKing";
// var mongoCliUrl="mongodb:/\/"+url.replace("mongodb:/\/","").replace(/:/,":'").replace(/@/,"'@");
var moment = require("moment");
var elasticsearch = require("elasticsearch");
var shell = require("shelljs");
var db = dbConnector.getConnection();
var mongoCliUrl = dbConnector.getUrl();
//var shell = require("../helpers/shellHelper");
var client = new elasticsearch.Client({
    host: "localhost:9200",
    log: "trace"
});

function init(_logger, _cuti, _crudder, _reportLogcrudder) {
    logger = _logger,
        cuti = _cuti;
    crudder = _crudder;
    reportLogCrudder = _reportLogcrudder;
}

function claimAsset(responseAsset) {
    return new Promise((resolve, reject) => {
        cuti.request.getUrlandMagicKey("asset").then(options => {
            options.path = "/asset/v1/claim/" + "ImportDocuments";
            options.method = "PUT";
            options.headers = {
                "content-type": "application/json"
            };
            options.path += "?id=" + JSON.parse(responseAsset)._id;
            http.request(options, res => {
                res.statusCode == 200 ? resolve() : reject();
            }).end();
        }).catch((err) => {
            reject(err);
        });
    });
}

function uploadToAsset(filename) {
    return new Promise((resolve, reject) => {
        cuti.request.getUrlandMagicKey("asset").then(options => {
            var downloadPath = options;
            options.path += "/upload?type=doc";
            options.method = "POST";
            request.post({
                url: "http://" + options.hostname + ":" + options.port + options.path,
                formData: {
                    file: fs.createReadStream(filename)
                },
                headers: options.headers
            }, function functionCallback(err, response, body) {
                if (err) {
                    reject(err);
                } else {
                    claimAsset(body).then(() => {
                        fs.unlink(filename);
                    }).catch((err) => {
                        reject(err);
                    });
                    body.downloadPath = downloadPath;
                    resolve(body);
                }
            });
        }).catch((err) => {
            reject(err);
        });
    });
}

function findTemplate(templateId) {
    // Function to fetch the Template info by Id
    logger.trace("Getting the template ", templateId);
    var query = { "$or": [{ "_id": templateId }, { "templateName": templateId }] };
    return new Promise(function (resolve, reject) {
        crudder.model.findOne(
            /*{
            "_id": templateId
        }*/
            query
        ).exec()
            .then(function (document) {
                resolve(document);
            })
            .catch(function (err) {
                reject(err);
            });
    });
}

function reportdownload(req, res) {
    var templateId = req.swagger.params.templateId.value;
    var _filter = req.swagger.params["data"].value;
    findTemplate(templateId)
        .then(templateInfo => {
            if (templateInfo) {
                if (validateAssignedUser(templateInfo, req.user)) {
                    if (templateInfo.templateType == "export") {
                        var reportLog = {};
                        reportLog.userAssigned = req.user.username;
                        reportLog.createdAt = Date.now();
                        reportLog.templateId = templateId;
                        reportLog.templateName = templateInfo.templateName;
                        var summary;
                        var filteredData;
                        if (_filter)
                            filteredData = fetchFiletrs(templateInfo.inputFilters, _filter);
                        else
                            filteredData = {};

                        if (templateInfo.isQueryBased && templateInfo.queryFrom === "Elastic") {
                            /**TODO Implementation is pending */
                        }
                        else if (templateInfo.isQueryBased && templateInfo.queryFrom === "mongo") {
                            //var _querydata = JSON.parse(req.swagger.params["querydata"].value).querydata;
                            mongoQueryResult(templateInfo, filteredData, res, reportLog, req.user);
                        }
                        else {
                            if(_.isEmpty(filteredData)){
                                try {
                                    filteredData=JSON.parse(_filter);
                                } catch (error) {
                                    logger.error("Error Occured while parsing the filter Value ");
                                    filteredData={};
                                }
                            }
                            fetchDetailsFromCollection(templateInfo.collectionName, templateInfo.path, (filteredData), templateInfo.limit)
                                .then(_data => {
                                    var collectionData = JSON.parse(_data);
                                    var _groupingFileds = groupingFileds(templateInfo);
                                    var _header = header(templateInfo);
                                    var opFields = operationFields(templateInfo);
                                    var _dynamicColums = dynamicColumn(templateInfo);
                                    mapData(templateInfo, collectionData)
                                        .then(_mappedData => {
                                            var _formattedData = formatData(_mappedData, _header);
                                            var _dynamicColAddedData = addDynamicColumns(_formattedData, _dynamicColums);
                                            var convertedData = dataTypeConversion(templateInfo, _formattedData);
                                            if (!_.isEmpty(_groupingFileds)) {
                                                var _groupOperation = groupOperation(templateInfo);
                                                var _groupOperation = groupOperation(templateInfo);
                                                var _groupedData = groupByFields(convertedData, _groupingFileds);
                                                summary = groupedDataSummary(_groupedData, templateInfo.fieldDefinition);
                                            } else {
                                                summary = convertedData;
                                            }

                                            if (templateInfo.outputType == "json") {
                                                reportLog.fileOutputType = "json";
                                                res.set("Content-Type", "application/json");
                                                res.status(200).send(summary);
                                            }
                                            else if (templateInfo.outputType == "csv") {
                                                csvFileCreation(summary, _header, templateInfo)
                                                    .then(obj => {
                                                        reportLog.downloadLink = obj.downloadLink;
                                                        reportLog.filename = obj.filename;
                                                        reportLog.fileOutputType = "csv";
                                                        saveReportLogs(reportLog, res);
                                                        // res.set("Content-Type", "application/json");
                                                        // res.status(200).send(obj);
                                                    })
                                                    .catch(err => {
                                                        res.set("Content-Type", "application/json");
                                                        res.status(400).send({ message: err });
                                                    });
                                            }
                                            else if (templateInfo.outputType == "xml") {
                                                xmlFileCreation(summary, templateInfo)
                                                    .then(obj => {
                                                        reportLog.downloadLink = obj.downloadLink;
                                                        reportLog.filename = obj.filename;
                                                        reportLog.fileOutputType = "xml";
                                                        saveReportLogs(reportLog, res);
                                                    })
                                                    .catch(err => {
                                                        res.set("Content-Type", "application/json");
                                                        res.status(400).send(err);
                                                    });
                                            }
                                            else {
                                                execelFileCreation(summary, _header, templateInfo)
                                                    .then(obj => {
                                                        reportLog.downloadLink = obj.downloadLink;
                                                        reportLog.filename = obj.filename;
                                                        reportLog.fileOutputType = "xml";
                                                        saveReportLogs(reportLog, res);

                                                    })
                                                    .catch(err => {
                                                        res.set("Content-Type", "application/json");
                                                        res.status(400).send(err);
                                                    });

                                            }
                                        })
                                        .catch(err => {
                                            res.set("Content-Type", "application/json");
                                            res.status(400).send(err);
                                        });
                                }).catch(err => {
                                    res.set("Content-Type", "application/json");
                                    res.status(400).send(err);
                                });
                        }
                    } else {
                        res.set("Content-Type", "application/json");
                        res.status(400).send({
                            message: "This is not export type"
                        });
                    }
                }
                else {
                    res.set("Content-Type", "application/json");
                    res.status(400).send({
                        message: "User is Not Assigned"
                    });
                }
            } else {
                res.set("Content-Type", "application/json");
                res.status(400).send({
                    message: "Template is Not Found"
                });
            }
        })
        .catch(err => {
            res.set("Content-Type", "application/json");
            res.status(400).send(err);
        });
}

var validateAssignedUser = (templateInfo, user) => {
    if (templateInfo.assignedUser) {
        let refId = _.filter(templateInfo.assignedUser, function (item) {
            return item === user.refId;
        });
        /**If the given user if not present in the assigned usedr then check for userType
         * if they specified any userType then allow them to download Report
         */
        if (refId.length > 0) {
            return true;
        }
        else if (templateInfo.userType == user.userType) {
            return true;
        }
        else {
            return false;
        }
    }
    else {
        return false;
    }
};

var dataTypeConversion = (templateInfo, data) => {
    templateInfo.fieldDefinition.map(fields => {
        if (fields.type == "Date" || fields.type == "DateTime") {
            convertToDate(data, fields.name, fields.format);
        }
    });
    return data;
};

var convertToDate = (data, columnName, _format) => {
    data.map(_row => {
        if (_row[columnName] != "" && _row[columnName] != " " && _row[columnName]) {
            var date = new Date(_row[columnName]);
            var now = moment(date);
            _row[columnName] = now.format(_format);
        } else {
            _row[columnName] = " ";
        }
        // _row[columnName] = date.getDate() + '-' + (date.getMonth() + 1) + '-' + date.getFullYear();
    });
    return data;
};

var addDynamicColumns = (formattedData, dynamicColums) => {
    dynamicColums.map(el => {
        formattedData.map(row => {
            row[el.name] = el.value;
        });
    });
    return formattedData;
};

var dynamicColumn = (templateInfo) => {
    var dynamicFields = [];
    templateInfo.fieldDefinition.map(el => {
        let operationField = {};
        if (!_.isEmpty(el.dynamicColumn) && el.dynamicColumn.isDynamicCol) {
            operationField.name = el.name;
            operationField.value = el.dynamicColumn.value;
            dynamicFields.push(operationField);
        }
    });
    return dynamicFields;
};

var formatData = (_mappedData, _header) => {
    var rows = [];

    var Length;
    _mappedData.map(row => {
        var arrayElements = [];
        var arr = [];
        var elements = [];
        _header.map(headfield => {
            if (_.isArray(row[headfield]) && row[headfield]) {
                arr.push(headfield);
                arrayElements = _.uniq(arr);
                Length = (row[headfield]).length;
            } else {
                elements.push(headfield);
            }
        });
        var a = [];
        while (Length > 0) {
            var newrow = {};
            a.push(newrow);
            Length--;
        }
        arrayElements.map(el => {
            if (row[el]) {
                row[el].map((els, index) => {
                    a[index][el] = els;
                });
            }
        });
        var alength = a.length;
        if (a.length == 0) {
            a[0] = row;
        }
        a.map(el => {
            elements.map(els => {
                el[els] = row[els];
            });
        });
        a.map(_row => {
            rows.push(_row);
        });
    });
    if (rows.length > 0) {
        return rows;
    } else {
        return _mappedData;
    }
};

var saveReportLogs = (data, res) => {
    reportLogCrudder.model.create(data, function (err, doc) {
        if (err)
            res.status(400).send({ message: "Something went wrong while saving Report Logs " + err });
        else
            res.status(200).send(doc);
    });
};

var groupByFields = (formattedData, _groupingFileds) => {
    var groupedData = _.groupBy(formattedData, function (item) {
        return obsKeysToString(item, _groupingFileds, "-");
    });
    return groupedData;
};

var foriegnKey = (templateInfo) => {
    var foriegnKey = [];
    templateInfo.fieldDefinition.map(el => {
        let operation = {};
        if (el.isForeignKey) {
            operation.column = el.column;
            operation.name = el.name;
            operation.groupedFieldOperation = el.groupedFieldOperation;
            operation._collectionName = el._collectionName;
            foriegnKey.push(operation);
        }
    });
    return foriegnKey;
};

var groupOperation = (templateInfo) => {
    var groupFields = [];
    templateInfo.fieldDefinition.map(el => {
        let operation = {};
        if (el.isGrouped) {
            operation.column = el.column;
            operation.name = el.name;
            operation.groupedFieldOperation = el.groupedFieldOperation;
            groupFields.push(operation);
        }
    });
    return groupFields;
};

var groupedDataSummary = (_groupedData, _operation) => {
    let summary = [];
    Object.keys(_groupedData).forEach(function (key) {
        let data = {};
        _operation.map(column => {
            switch (column.groupedFieldOperation) {
                case "sum":
                    data = (sum(_groupedData[key], column.name));
                    break;
                case "avg":
                    data = (avg(_groupedData[key], column.name));
                    break;
                case "min":
                    data = (min(_groupedData[key], column.name));
                    break;
                case "max":
                    data = (max(_groupedData[key], column.name));
                    break;
                case "count":
                    data = (count(_groupedData[key], column.name));
                    break;
                case "join":
                    data = (join(_groupedData[key], column.name));
                    break;
                case "distinct":
                    data = (distinct(_groupedData[key], column.name));
                    break;
                case "none":
                    data = (none(_groupedData[key], [column.name]));
                    break;
            }
        });
        summary.push(data);
    });
    return summary;
};



var count = (_groupedData, columnName) => {
    var singleRow = _groupedData[0];
    singleRow[columnName] = _groupedData.length;
    return singleRow;
};

var none = (_groupedData, columnName) => {
    var singleRow = _groupedData[0];
    singleRow[columnName] = _groupedData[0][columnName];
    return singleRow;
};

var sum = (_groupedData, columnName) => {
    var singleRow = _groupedData[0];
    var sumTotal = 0;
    _groupedData.map(el => {
        if (el[columnName])
            sumTotal += parseFloat(el[columnName]);
    });
    singleRow[columnName] = sumTotal;
    return singleRow;
};

var avg = (_groupedData, columnName) => {
    var singleRow = _groupedData[0];
    var sumTotal = 0;
    _groupedData.map(el => {
        if (el[columnName])
            sumTotal += parseFloat(el[columnName]);
    });
    singleRow[columnName] = sumTotal / _groupedData.length;
    return singleRow;
};

var min = (_groupedData, columnName) => {
    var singleRow = _groupedData[0];
    var values = [];
    _groupedData.map(el => {
        values.push(parseFloat(el[columnName]));
    });
    singleRow[columnName] = _.min(values);
    return singleRow;
};

var max = (_groupedData, columnName) => {
    var singleRow = _groupedData[0];
    var values = [];
    _groupedData.map(el => {
        values.push(parseFloat(el[columnName]));
    });
    singleRow[columnName] = _.max(values);
    return singleRow;
};

var join = (_groupedData, columnName) => {
    var singleRow = _groupedData[0];
    var values = [];
    _groupedData.map(el => {
        values.push(el[columnName]);
    });
    singleRow[columnName] = _.join(values, "-");
    return singleRow;
};

var distinct = (_groupedData, columnName) => {
    var singleRow = _groupedData[0];
    var values = [];
    _groupedData.map(el => {
        values.push(parseFloat(el[columnName]));
    });
    singleRow[columnName] = _.uniq(values);
    return singleRow;
};

function obsKeysToString(o, k, sep) {
    return k.map(key => _.get(o, key)).filter(v => v).join(sep);
}
var header = (templateInfo) => {
    var headers = [];
    templateInfo.fieldDefinition.map(el => {
        headers.push(el.name);
    });
    return headers;
};

/**
 * 
 * @param {*} _formattedData 
 * @param {*} templateInfo 
 * This method will convert the json data to xml format
 */
var xmlFileCreation = (_formattedData, templateInfo) => {
    return new Promise((resolve, reject) => {
        var dir = "temp";
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        var file = templateInfo.collectionName + "_" + Date.now() + ".xml";
        var desPath = dir + "/" + file;
        var _data = json2xml({ "data": _formattedData });
        fs.writeFile(desPath, _data, function (err) {
            if (err)
                throw err;
            else {
                uploadToAsset(desPath).then(assetData => {
                    var data = JSON.parse(assetData);
                    var obj = {};
                    obj.filename = data.originalName;
                    cuti.request.getUrlandMagicKey("asset")
                        .then(options => {
                            options.path += "/" + data._id;
                            obj.downloadLink = "http://" + options.hostname + ":" + options.port + options.path;
                            obj.downloadLink = options.path;
                            obj.downloadLink = data._id;
                            resolve(obj);
                        }).catch((err) => {
                            reject(err);
                        });
                }).catch((err) => {
                    reject(err);
                });
            }
        });
    });
};

/**
 * 
 * @param {*} _formattedData 
 * @param {*} headers 
 * @param {*} templateInfo 
 * This method takes the header row and formatted Data and template Info
 */
var execelFileCreation = (_formattedData, headers, templateInfo) => {
    return new Promise((resolve, reject) => {
        var workbook = new Excel.Workbook();
        var sheet = workbook.addWorksheet("sheet1");

        sheet.properties.defaultRowHeight = 15;
        _formattedData.map((row, index) => {
            if (index == 0) {
                sheet.columns = [];
                var header = [];
                Object.keys(row).forEach(function (key) {
                    // if (key != "_id") {
                    var _header = {
                        header: key,
                        key: key,
                        width: 20
                    };
                    header.push(_header);
                    // }
                });
                sheet.columns = header;
                sheet.addRow(row);
            } else {
                sheet.addRow(row);
            }
        });
        var dir = "temp";
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        var destPath = dir + "/" + templateInfo.collectionName + "_" + Date.now() + ".xlsx";
        workbook.xlsx.writeFile(destPath)
            .then(function () {
                //resolve(destPath);
                uploadToAsset(destPath).then(assetData => {
                    var data = JSON.parse(assetData);
                    var fileInfo = {};
                    fileInfo.filename = data.originalName;
                    cuti.request.getUrlandMagicKey("asset")
                        .then(options => {
                            options.path += "/" + data._id;
                            fileInfo.downloadLink = data._id;
                            resolve(fileInfo);
                        }).catch((err) => {
                            reject(err);
                        });
                }).catch((err) => {
                    reject(err);
                });
            }).catch((err) => {
                reject(err);
            });
    });
};

var csvFileCreation = (_formattedData, headers, templateInfo) => {
    return new Promise((resolve, reject) => {
        json2csv({
            data: _formattedData,
            fields: headers
        }, function (err, csv) {
            if (err)
                logger.info("The err is==>", err);
            else {
                var obj = {};
                var dir = "temp";
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir);
                }

                var file = templateInfo.collectionName + "_" + Date.now() + ".csv";
                var desPath = dir + "/" + file;
                fs.writeFile(desPath, csv, function (err) {
                    if (err)
                        throw err;
                    else {
                        uploadToAsset(desPath).then(assetData => {
                            var data = JSON.parse(assetData);
                            obj.filename = data.originalName;
                            cuti.request.getUrlandMagicKey("asset")
                                .then(options => {
                                    options.path += "/" + data._id;
                                    obj.downloadLink = "http://" + options.hostname + ":" + options.port + options.path;
                                    obj.downloadLink = options.path;
                                    obj.downloadLink = data._id;
                                    resolve(obj);
                                }).catch(err => {
                                    reject(err);
                                });
                        }).catch((err) => {
                            reject(err);
                        });
                    }
                });
            }
        });
    });
};

/**
 * This function will create jsonFile for the json Data
 * @param {*} _jsonData 
 * @param {*} templateInfo 
 */
var jsonFileCreation = (_jsonData, templateInfo) => {
    return new Promise((resolve, reject) => {
        var obj = {};
        var dir = templateInfo.collectionName;
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        var file = templateInfo.collectionName + "_" + Date.now() + ".json";
        var desPath = dir + "/" + file;
        fs.writeFile(desPath, _jsonData, function (err) {
            if (err)
                throw err;
            else {
                uploadToAsset(desPath).then(assetData => {
                    var data = JSON.parse(assetData);
                    obj.filename = data.originalName;
                    cuti.request.getUrlandMagicKey("asset")
                        .then(options => {
                            options.path += "/" + data._id;
                            obj.downloadLink = "http://" + options.hostname + ":" + options.port + options.path;
                            obj.downloadLink = options.path;
                            obj.downloadLink = data._id;
                            resolve(obj);
                        }).catch((err) => {
                            reject(err);
                        });
                }).catch((err) => {
                    reject(err);
                });
            }
        });
    });
};

/**
 * This function will be useful when we add formula's,As of Now i didnt used but it might be userful
 * @param {*} _mappedData 
 * @param {*} opFields 
 */
var applyFormula = (_mappedData, opFields) => {
    opFields.map(el => {
        Object.keys(el).forEach(function (key) {
            var expr = Parser.parse(el[key]);
            var variables = expr.variables();
            _mappedData.map(singleRow => {
                var v = {};
                var arrayRow = {};
                variables.map(variable => {
                    v[variable] = singleRow[variable];
                });
                singleRow[key] = expr.evaluate(v);
            });
        });
    });
    return _mappedData;

};

var operationFields = (templateInfo) => {
    var operationFields = [];
    templateInfo.fieldDefinition.map(el => {
        var operationField = {};
        if (!_.isEmpty(el.operation) && el.dynamicColumn.isDynamicCol) {
            operationField[el.name] = el.operation;
            operationFields.push(operationField);
        }
    });
    return operationFields;
};

var groupingFileds = (templateInfo) => {
    var groupFields = [];
    templateInfo.fieldDefinition.map(el => {
        if (el.isGrouped && el.groupedFieldOperation === "none")
            groupFields.push(el.name);
    });
    return groupFields;
};

/**
 * This function prepares the filter According to the given Template
 * @param {*} _templateinputfilter 
 * @param {*} filterData 
 */
function fetchFiletrs(_templateinputfilter, filterData) {
    var outFilter = {};
    var _fileteredData = JSON.parse((filterData));
    _templateinputfilter.map(infilter => {
        Object.keys(_fileteredData).forEach(function (key) {
            if (_.isEqual(infilter.column, key)) {
                if (_.isObject(_fileteredData[key])) {
                    var subObj = {};
                    Object.keys(_fileteredData[key]).forEach(function (subkey) {
                        if (infilter.type == "DateRange" || infilter.type == "DateTimeRange" || infilter.type == "Date1") {
                            var kk = "\ ISODate(" + "'" + (_fileteredData[key][subkey]) + "'" + ")/";
                            subObj[subkey] = String(kk).substring(1).slice(0, -1);
                        }
                        else if (infilter.type == "Number") {
                            subObj[subkey] = parseInt(_fileteredData[key][subkey]);
                        }
                        else {
                            subObj[subkey] = _fileteredData[key][subkey];
                        }
                    });
                    outFilter[key] = subObj;
                }
                else {
                    if (infilter.type == "DateRange" || infilter.type == "DateTimeRange" || infilter.type == "Date1") {
                        outFilter[key] = "\ ISODate(" + "'" + (_fileteredData[key]) + "'" + ")";
                        // outFilter[key] = 'ISODate(' + "'"+_fileteredData[key] + ')';
                    }
                    else if (infilter.type == "Number") {
                        outFilter[key] = parseInt(_fileteredData[key]);
                    }
                    else {
                        outFilter[key] = _fileteredData[key];
                    }
                }
            }
        });
    });
    return outFilter;

}

function mapData(templateInfo, collectionData) {
    return new Promise((resolve, reject) => {
        var bodyData = [];
        collectionData.map(_data => {
            var _row = {};
            templateInfo.fieldDefinition.map(fields => {
                if (_.isEmpty(fields.operation)) {
                    if (fields.column)
                        colValue = getColumnValue(_data, fields.column);

                    if (colValue) {
                        if (_.isArray(colValue)) {
                            switch (fields.groupedFieldOperation) {
                                case "sum":
                                    var sum = 0;
                                    colValue.map(el => {
                                        sum += el;
                                    });
                                    _row[fields.name] = sum;
                                    break;
                                case "avg":
                                    var sum = 0;
                                    colValue.map(el => {
                                        sum += el;
                                    });
                                    _row[fields.name] = sum / colValue.length;
                                    break;
                                case "min":
                                    _row[fields.name] = _.min(colValue);
                                    break;
                                case "max":
                                    _row[fields.name] = _.max(colValue);
                                    break;
                                case "distinct":
                                    _row[fields.name] = _.uniq(colValue);
                                    break;
                                case "join":
                                    _row[fields.name] = _.join(colValue, "-");
                                    break;
                                case "count":
                                    _row[fields.name] = colValue.length;
                                    break;
                                case "none":
                                    _row[fields.name] = colValue;
                                    break;
                            }
                        } else {
                            _row[fields.name] = colValue;
                        }
                    } else {
                        _row[fields.name] = colValue;
                    }
                } else if (!_.isEmpty(fields.operation)) {
                    var alias = fields.alias;
                    var expr = Parser.parse(fields.operation);
                    var variables = expr.variables();
                    var val = [];
                    alias.map(el => {
                        var singleRowVal = {};
                        if (el.value)
                            var colValue = getColumnValue(_data, el.value);
                        singleRowVal.value = colValue;
                        if (_.isArray(colValue)) {
                            singleRowVal.isArrayVal = true;
                        } else {
                            singleRowVal.isArrayVal = false;
                        }
                        singleRowVal.name = el.name;
                        val.push(singleRowVal);

                    });
                    var length = val.length;
                    var a = [];
                    var grouped = _.groupBy(val, function (item) {
                        if (item.isArrayVal)
                            return item;
                    });
                    Object.keys(grouped).forEach(function (key) {
                        if (key) {
                            let arrayObjects = grouped[key];
                            var arrLength;
                            arrayObjects.map(el => {
                                arrLength = el.value.length;
                            });
                            while (arrLength > 0) {
                                let singleObject = {};
                                a.push(singleObject);
                                arrLength--;
                            }

                        } else {

                        }
                    });

                    val.map(el => {
                        if (el.isArrayVal) {
                            el.value.map((individiual, index) => {
                                a[index][el.name] = individiual;
                            });
                        } else {
                            a.map(els => {
                                els[el.name] = el.value;
                            });
                        }
                    });
                    var evaluatedArr = [];
                    a.map(el => {
                        evaluatedArr.push(_.round(expr.evaluate(el), 3));
                    });
                    _row[fields.name] = groupOperationResult(evaluatedArr, fields.groupedFieldOperation);
                }
            });
            bodyData.push(_row);
        });
        var _header = header(templateInfo);
        var data = formatData(bodyData, _header);
        var _foriegnKey = foriegnKey(templateInfo);
        if (_foriegnKey.length > 0) {
            fillDataForForiegnCol(_foriegnKey, data, templateInfo)
                .then(obj => {
                    resolve(obj);
                }).catch((err) => {
                    reject(err);
                });
        } else {
            resolve(bodyData);
        }
    });
}


var fillDataForForiegnCol = (_foriegnKey, mappedData, templateInfo) => {
    var forienkeys = [];
    var distinctForienkeys = [];
    return new Promise((resolve, reject) => {
        _foriegnKey.map(el => {
            let mycollection = db.collection(el._collectionName);
            mappedData.map(row => {
                if (_.isArray(row[el.name])) {
                    row[el.name].map(el => {
                        forienkeys.push(el);
                    });
                } else {
                    forienkeys.push(row[el.name]);
                }
            });
            var _secCol = secondaryCol(templateInfo);
            distinctForienkeys = _.uniq(forienkeys);
            fetchData(mycollection, distinctForienkeys)
                .then(docs => {
                    var data = _formRow(docs, mappedData, _secCol, el.name);
                    resolve(data);
                }).catch(err => {
                    reject(err);
                });
        });
    });
};

var _formRow = (docs, mappedData, templateInfo, name) => {
    var _mappedData = [];

    var data = _.groupBy(mappedData, function (item) {
        return item[name];
    });

    docs.map(row => {
        similarIdData = _.filter(mappedData, function (item) {
            return item[name] == row._id;
        });

        templateInfo.map(head => {
            if (!_.isEmpty(head.operation)) {
                var alias = head.alias;
                var expr = Parser.parse(head.operation);
                var variables = expr.variables();
                var val = [];
                alias.map(el => {
                    var singleRowVal = {};
                    if (el.value)
                        var colValue = getColumnValue(row, el.value);
                    singleRowVal.value = colValue;
                    if (_.isArray(colValue)) {
                        singleRowVal.isArrayVal = true;
                    } else {
                        singleRowVal.isArrayVal = false;
                    }
                    singleRowVal.name = el.name;
                    val.push(singleRowVal);

                });
                var length = val.length;
                var a = [];
                var grouped = _.groupBy(val, function (item) {
                    if (item.isArrayVal)
                        return item;
                });
                Object.keys(grouped).forEach(function (key) {
                    if (key) {
                        let arrayObjects = grouped[key];
                        var arrLength;
                        arrayObjects.map(el => {
                            arrLength = el.value.length;
                        });
                        while (arrLength > 0) {
                            let singleObject = {};
                            a.push(singleObject);
                            arrLength--;
                        }

                    } else {

                    }
                });
                val.map(el => {
                    if (el.isArrayVal) {
                        el.value.map((individiual, index) => {
                            a[index][el.name] = individiual;
                        });
                    } else {
                        a.map(els => {
                            els[el.name] = el.value;
                        });
                    }
                });
                var evaluatedArr = [];
                a.map(el => {
                    evaluatedArr.push(_.round(expr.evaluate(el), 3));
                });
                similarIdData.map(_eachRow => {
                    _eachRow[head.name] = groupOperationResult(evaluatedArr, head.groupedFieldOperation);
                    _mappedData.push(_eachRow);
                });

            } else {

                similarIdData.map(_eachRow => {
                    colValue = getColumnValue(row, head.column);
                    _eachRow[head.name] = colValue;
                    _mappedData.push(_eachRow);
                });

            }
        });
    });
    return mappedData;
};


var secondaryCol = (templateInfo) => {
    var secondaryCols = [];
    templateInfo.fieldDefinition.map(el => {
        let operations = {};
        if (el.isSecondaryCol) {
            operations.column = el.column;
            operations.name = el.name;
            operations.groupedFieldOperation = el.groupedFieldOperation;
            operations._collectionName = el._collectionName;
            operations.operation = el.operation;
            operations.alias = el.alias;
            secondaryCols.push(operations);
        }
    });
    return secondaryCols;
};

var fetchData = (collection, ids) => {
    return new Promise((resolve, reject) => {
        collection.find({
            _id: {
                $in: ids
            }
        }, function (err, doc) {
            if (doc) {
                resolve(doc);
            } else
                reject();
        });
    });
};

var groupOperationResult = (arr, operation) => {
    var _data = 0;
    switch (operation) {
        case "sum":
            var sumTotal = 0;
            arr.map(el => {
                sumTotal += el;
            });
            _data = sumTotal;
            break;
        case "avg":
            var sum = 0;
            arr.map(el => {
                sum += el;
            });
            _data = sum / arr.length;
            break;
        case "min":
            _data = _.min(arr);
            break;
        case "max":
            _data = _.max(arr);
            break;
        case "distinct":
            _data = _.uniq(arr);
            break;
        case "join":
            _data = _.join(arr, "-");
            break;
        case "count":
            _data = 1;
            break;
        case "none":
            _data = arr;
            break;
    }
    return _data;
};

var getColumnValue = (_data, column) => {
    var operation = column.groupedFieldOperation;
    var splittedColumnValue = _.split(column, ".");

    var v;
    splittedColumnValue.map((el, index) => {
        if (_.includes(el, "[n]") || _.isArray(_data)) {
            if ((index > 0 && _.isArray(_data) && !_.includes(el, "[n]"))) {
                var arr = [];
                _data.map(els => {
                    arr.push(els[el]);
                });
                v = arr;
                _data = v;
            } else if (index > 0 && _.isArray(_data) && _.includes(el, "[n]")) {
                var arr = [];
                _data.map(els => {
                    (els[_.trim(el, "[n]")]).map(e => {
                        arr.push(e);
                    });
                });
                v = arr;
                _data = v;
            } else {

                if (_data[_.trim(el, "[n]")]) {
                    var v = _data[_.trim(el, "[n]")];
                    _data = v;
                } else {
                    _data = "";
                }
            }
        } else {
            if (_data[el]) {
                v = _data[el];
                _data = v;
            } else {
                _data = "";
            }

        }
    });
    return _data;
};

function fetchDetailsFromCollection(collectionName, path, filter, limit) {
    return new Promise((resolve, reject) => {
        cuti.request.getUrlandMagicKey(collectionName).then(options => {
            options.method = "GET";
            if (path) {
                options.path += path;
            }

            if (limit)
                options.path += "?count=" + "" + limit;
            else
                options.path += "?count=50";

            if (!_.isEmpty(filter)) {
                options.path += "&filter=" + encodeURIComponent(JSON.stringify(filter));
            }
            http.request(options, response => {
                var data = "";
                response.on("data", _data => data += _data);
                response.on("end", () => {
                    if (response.statusCode >= 200 && response.statusCode < 299) {
                        resolve(data);
                    } else {
                        if (JSON.parse(data).results) {
                            reject(JSON.parse(data).results["errors"]);
                        } else {
                            reject(data);
                        }
                    }
                });
            }).end();
        }).catch(err => {
            reject(err);
        });
    });
}

function elasticSearchQueryResult(req, res) {
    client.search({
        index: "account",
        body: {
            "size": 0,
            "aggs": { "max_value": { "max": { "field": "amount" } } }
        }
    }).then(function (resp) {
        var hits = resp.hits.hits;
        res.send(resp);
    }, function (err) {
        logger.trace(err.message);
    });
}

function getAllReportForAssignedUser(req, res) {
    crudder.model.find({ assignedUser: { $in: [req.user.username] } }, { "templateName": 1, _id: 1 }, function (err, docs) {
        if (err) {
            res.set("Content-Type", "application/json");
            res.status(400).json(err);
        }
        else if (docs) {
            res.set("Content-Type", "application/json");
            res.status(400).send(docs);
        }
        else {
            res.set("Content-Type", "application/json");
            res.status(400).json("Documents Not Found");
        }
    });
}

function getReportLogs(req, res) {
    reportLogCrudder.model.find({}, function (err, docs) {
        if (err) {
            res.set("Content-Type", "application/json");
            res.status(400).json(err);
        }
        else if (docs) {
            res.set("Content-Type", "application/json");
            res.status(400).send(docs);
        }
        else {
            res.set("Content-Type", "application/json");
            res.status(400).json("Documents Not Found");
        }
    });
}

var mongoQueryResult = (templateInfo, _filetrs, res, reportLog, user) => {
    var builtQuery;
    if (_.isEmpty(_filetrs) && _.isEmpty(templateInfo.inputFilters)) {
        builtQuery = templateInfo.query;
    }
    else {
        builtQuery = buildQuery(templateInfo.query, _filetrs, templateInfo.inputFilters, user);
    }
    execute(builtQuery).then(obj => {
        // var parsedObj = parseBson(obj);
        var da = parseBson(obj);
        var arr = [];
        var headers = [];
        if (_.isArray(da)) {
            arr = da;
            if (da.length > 0) {
                var _header = _.maxBy(da, function (o) { return _.size(o); });
                Object.keys(_header).forEach(function (key) {
                    headers.push(key);
                });
            }
            else {
                throw new Error("Document Not found");
            }
        }
        else {
            headers.push("count");
            arr.push({ "count": da });
        }
        if (templateInfo.outputType === "json") {
            res.set("Content-Type", "application/json");
            res.status(200).send(da);
        }
        else if (templateInfo.outputType === "csv") {
            csvFileCreation(arr, headers, templateInfo)
                .then(resobj => {
                    reportLog.downloadLink = resobj.downloadLink;
                    reportLog.filename = resobj.filename;
                    reportLog.fileOutputType = "csv";
                    saveReportLogs(reportLog, res);
                    // res.set("Content-Type", "application/json");
                    // res.status(200).send(resobj);
                })
                .catch(err => {
                    res.set("Content-Type", "application/json");
                    res.status(err).send(err);
                });
        }
        else if (templateInfo.outputType === "xml") {
            xmlFileCreation(arr, templateInfo)
                .then(obj => {
                    reportLog.downloadLink = obj.downloadLink;
                    reportLog.filename = obj.filename;
                    reportLog.fileOutputType = "xml";
                    saveReportLogs(reportLog, res);
                    // res.set("Content-Type", "application/json");
                    // res.status(200).send(obj);
                })
                .catch(err => {
                    res.set("Content-Type", "application/json");
                    res.status(400).send(err);
                });
        }
        else {
            execelFileCreation(arr, headers, templateInfo)
                .then(resobj => {
                    reportLog.downloadLink = resobj.downloadLink;
                    reportLog.filename = resobj.filename;
                    reportLog.fileOutputType = "xls";
                    saveReportLogs(reportLog, res);

                })
                .catch(err => {
                    res.set("Content-Type", "application/json");
                    res.status(err).send(err);
                });
        }
    })
        .catch(err => {
            res.set("Content-Type", "application/json");
            res.status(400).send({ message: err.toString() });
        });
};

var buildQuery = (query, filter, templateFilterInfo, user) => {
    //var _filter = JSON.parse(filter);
    var _filter = filter;
    templateFilterInfo.map(el => {
        /**check if the el object contains isShow property or not,if doesnot contain then replace it with query from the filter Objects
         * else assign it with request.user object
        */
        if ((el.isShow == true || el.isShow == undefined)) {
            Object.keys(_filter).forEach(function (key) {
                if (_.isEqual(key, el.column)) {
                    var k = {};
                    if (_.isObject(_filter[key])) {
                        var subObj = {};
                        var str = "";
                        var count = 0;
                        var lengthObje = _.size(_filter[key]);
                        Object.keys(_filter[key]).forEach(function (subkey) {
                            if (el.type == "Date" || el.type == "DateTime" || el.type == "DateRangeTime") {
                                var ISOdate = new Date(_filter[key][subkey]);
                                if (count == 0 && lengthObje > 1) {
                                    str += "{" + subkey + ":" + "\ ISODate(" + "'" + (new Date(_filter[key][subkey]).toISOString()) + "'" + ")" + ",";
                                    // str += '{' + subkey + ':' + _filter[key][subkey] + ',';
                                }
                                else if (count == 0 && !(lengthObje > 1)) {
                                    str += "{" + subkey + ":" + "\ ISODate(" + "'" + (new Date(_filter[key][subkey]).toISOString()) + "'" + ")" + "}";
                                    // str += '{' + subkey + ':' + _filter[key][subkey] + '}';
                                }
                                else if (count == lengthObje - 1) {
                                    //str += subkey + ':' + _filter[key][subkey] + '}';
                                    str += subkey + ":" + "\ ISODate(" + "'" + (new Date(_filter[key][subkey]).toISOString()) + "'" + ")" + "}";
                                }
                                else {
                                    // str += subkey + ':' + _filter[key][subkey]
                                    str += subkey + ":" + "\ ISODate(" + "'" + (new Date(_filter[key][subkey]).toISOString()) + "'" + ")";
                                }
                                count++;
                            }
                            subObj[subkey] = _filter[key][subkey];
                        });
                        k[key] = str;
                        if (el.type == "Date" || el.type == "DateTime" || el.type == "DateRangeTime") {
                            //var v=JSON.stringify(k[key]);;
                            // query = query.replace("[" + el.name + "]", (k[key]));
                            query = replaceAll(query, "[" + el.name + "]", (k[key]));
                        }
                        else {
                            // query = query.replace("[" + el.name + "]", JSON.stringify(k[key]));
                            query = replaceAll(query, "[" + el.name + "]", JSON.stringify(k[key]));
                        }
                    }
                    else {
                        //if the filter Object key is not an object
                        let str = "";
                        if (el.type == "Date" || el.type == "DateTime") {
                            str += "ISODate(" + "'" + (new Date(_filter[key]).toISOString()) + "'" + ")";
                            k[key] = str;
                        } else {
                            k[key] = _filter[key];
                        }
                        query = replaceAll(query, "[" + el.name + "]", k[key]);
                        // query = query.replace("[" + el.name + "]", k);
                    }
                }
            });
        }
        else {
            let userValue = user[el.column];
            query = replaceAll(query, "[" + el.name + "]", userValue);
        }
    });
    return query;
};

/**
 * This function will replaces all the occurance of string value with value,
 * for example str var str="db.fundtransfers.aggregate([{'$match':{'createdAt':{$lte: ISODate('2017-12-23T18:29:59.999Z'),$gte: ISODate('2017-11-23T18:30:00.000Z')},'transaction':{ $elemMatch: { 'owner':'undefined' }}}},{'$project':{'Date':{$dateToString:{format:'%Y-%m-%d %H:%M:%S',date:{$add:['$createdAt',5.5*60*60*1000]}}},'transactionId':{$concat:['$_id','T']},'opening': {$cond: {if: {$eq: [ {'$arrayElemAt': ['$transaction.owner', 1]}, '[FID]' ] },'then': {'$subtract':[{'$arrayElemAt': ['$transaction.balance', 1]}, '$amount']},'else': {'$add':[{'$arrayElemAt': ['$transaction.balance', 0]}, '$amount']}}},'debit':{$cond: {if: {$eq: [ {'$arrayElemAt': ['$transaction.owner', 0]}, '[FID]' ] },'then': {'$arrayElemAt': ['$transaction.amount', 0]},'else': 0}},'credit':{$cond: { if: {$eq: [ {'$arrayElemAt': ['$transaction.owner', 1]}, '[FID]' ] },'then': {'$arrayElemAt': ['$transaction.amount', 1]},'else': 0 }},'closing':{$cond: {if: {$eq: [ {'$arrayElemAt': ['$transaction.owner', 1]}, '[FID]' ] },'then': {'$arrayElemAt': ['$transaction.balance', 1]},'else': {'$arrayElemAt': ['$transaction.balance', 0]}}},'_id':0,'type':'$type','ReferenceNo':'$entityId','creditedTo': {'$arrayElemAt': ['$transaction.owner', 1]},'debitedtedFrom': {'$arrayElemAt': ['$transaction.owner', 0]},'comments': '$comments'}}]).toArray()";
   The output is --->
   db.fundtransfers.aggregate([{'$match':{'createdAt':{$lte: ISODate('2017-12-23T18:29:59.999Z'),$gte: ISODate('2017-11-23T18:30:00.000Z')},'transaction':{ $elemMatch: { 'owner':'undefined' }}}},{'$project':{'Date':{$dateToString:{format:'%Y-%m-%d %H:%M:%S',date:{$add:['$createdAt',5.5*60*60*1000]}}},'transactionId':{$concat:['$_id','T']},'opening': {$cond: {if: {$eq: [ {'$arrayElemAt': ['$transaction.owner', 1]}, 'NAME' ] },'then': {'$subtract':[{'$arrayElemAt': ['$transaction.balance', 1]}, '$amount']},
   'else': {'$add':[{'$arrayElemAt': ['$transaction.balance', 0]}, '$amount']}}},'debit':{$cond: {if: {$eq: [ {'$arrayElemAt': ['$transaction.owner', 0]}, 'NAME' ] },'then': {'$arrayElemAt': ['$transaction.amount', 0]},'else': 0}},'credit':{$cond: { if: {$eq: [ {'$arrayElemAt': ['$transaction.owner', 1]}, 'NAME' ] },'then': {'$arrayElemAt': ['$transaction.amount', 1]},'else': 0 }},
   'closing':{$cond: {if: {$eq: [ {'$arrayElemAt': ['$transaction.owner', 1]}, 'NAME' ] },'then': {'$arrayElemAt': ['$transaction.balance', 1]},
   'else': {'$arrayElemAt': ['$transaction.balance', 0]}}},'_id':0,'type':'$type','ReferenceNo':'$entityId',
   'creditedTo': {'$arrayElemAt': ['$transaction.owner', 1]},'debitedtedFrom': {'$arrayElemAt': ['$transaction.owner', 0]},'comments': '$comments'}}]).toArray();
 * @param {*query} str 
 * @param {*key value} key 
 * @param {*value to be substituted } val 
 */
function replaceAll(str, key, val) {
    var pos = str.indexOf(key);
    while (pos !== -1) {
        str = str.replace(key, val);
        pos = str.indexOf(key, pos + 1);
    }
    return str;
}

function parseBson(bson) {

    var isoRegex = /"([^"]+?)"\s*:\s*ISODate\((".+?")\)/g;
    var objidRegex = /"([^"]+?)"\s*:\s*ObjectId\((".+?")\)/g;
    //var numberIntRegex=/"([^"]+?)"\s*:\s*NumberInt\((".+?")\)/g;
    var dateProps = [];
    bson = bson.replace(isoRegex, function (match, propName, dateStr) {
        dateProps.push(propName);
        return "\"" + propName + "\" : " + dateStr;
    });

    var objectId = [];
    bson = bson.replace(objidRegex, function (match, propName, dateStr) {
        objectId.push(propName);
        return "\"" + propName + "\" : " + dateStr;
    });

    // var numberInt = [];
    // bson = bson.replace(numberIntRegex, function (match, propName, dateStr) {
    //     numberInt.push(propName);
    //     return '"' + propName + '" : ' + dateStr;
    // });
    var obj = JSON.parse(bson);
    for (var i in dateProps)
        obj[dateProps[i]] = new Date(obj[dateProps[i]]);

    return obj;
}

function execute(_query) {
    return new Promise((resolve, reject) => {
        //url=dbConnector.getUrl();
        //var query='db.users.find({},{_id:0,username:1,password:1}).limit(2).toArray()';
        var execcmd = "mongo " + " --quiet " + mongoCliUrl + " --eval ";
        //var e = "'JSON.stringify" + "(" + query + ")'";
        var replacingQuery = _query.replace(/\'/g, "\"");
        var e = "'" + (replacingQuery) + "'";
        // console.log("The query is",execcmd + e);
        logger.info("The query is", execcmd + e);
        let dir = "tmp";
        if (!fs.existsSync(dir)) {
            fs.mkdir(dir);
        }
        var fname = dir + "/" + (new MD5().update(execcmd + e).digest("hex")) + ".json";
        shell.exec(execcmd + e + " > " + fname, { "silent": true, async: false }, function (code, out, stderr) {
            if (stderr) {
                reject(stderr);
            }
            else {
                fs.readFile(fname, "utf8", function (err, data) {
                    resolve(data);
                });
            }
        });
    });
}

/**
 * 
 * @param {*template information} templateInfo 
 * @param {* this is formatted data} modelData 
 */
var headerFooterAdder = (templateInfo, modelData) => {
    //when header text is present then replace the key value with that
    if (!_.isEmpty(templateInfo.header)) {

    }
    if (!_.isEmpty(templateInfo.footer)) {

    }

};

var dailyReport = (de) => {

};

var weekelyReport = (de) => {

};

var monthlyReport = (de) => {

};

function scheduleReportDownload(req, res) {
    crudder.model.find({ isScheduleReport: true }, function (err, documnets) {
        if (err) {
            res.status(400).send({ message: err });
        }
        else if (documnets.length > 0) {
            documnets.map(doc => {
                if (doc.type == "Weekely") {

                }
                else if (doc.type == "Monthly") {

                }
                else {

                }
            });
        }
        else {
            res.status(400).send({ message: "No Documents Found" });
        }
    });
}

module.exports = {
    init: init,
    reportdownload: reportdownload,
    queryTest: elasticSearchQueryResult,
    getAllReportForAssignedUser: getAllReportForAssignedUser,
    scheduleReportDownload: scheduleReportDownload
};