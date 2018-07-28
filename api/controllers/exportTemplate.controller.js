var http = require("http");
var _ = require("lodash");
var _crudder = null;
function init(crudder) {
    _crudder = crudder;
}
function customizer(objValue, srcValue) {
    if (_.isArray(objValue))
        return (srcValue);
}
var updateModel = (templateId, templlateModel) => {
    return new Promise((res, rej) => {
        _crudder.model.findOne({ _id: templateId }, function (err, oldvalue) {
            var updated = _.mergeWith(oldvalue, templlateModel, customizer);
            updated.save(updated, function (err, doc) {
                if (err)
                    rej(err);
                else
                    res(doc);
            });
        });
    });
};

var getTemplateById = (templateId) => {

    return new Promise((resob, rej) => {
        _crudder.model.findOne({ _id: templateId }, function (err, doc) {
            if (err)
                rej();
            else {
                resob(doc);
            }

        });
    });

};

var Delete = (templateId) => {
    return new Promise((res, rej) => {
        _crudder.model.remove({ _id: templateId }, function (err) {
            if (err)
                rej(err);
            else
                res();
        });
    });
};
var getAllTemplates = () => {
    return new Promise((res, rej) => {
        _crudder.model.find({}, function (err, doc) {
            if (err)
                rej(err);
            else
                res(doc);
        });
    });
};

var createTemplate = (data) => {
    if(!data.userType){
        data.userType=" ";
    }
    return new Promise((response, rej) => {
        _crudder.model.create(data, function (err, res) {
            if (err) {
                console.log(err);
                rej(err);
            }
            else {
                response(res);
            }
        });

    });
};

var validate = (data) => {
    /**if field Definition is Empty then i m not validating that directly i m resolving */
    return new Promise((res, rej) => {
        if(_.isEmpty(data)){
            Object.keys(data).map(el => {
                if (_.isArray(data[el])) {
                    for (var i = 0; i < data[el].length - 1; i++) {
                        for (var j = i + 1; j < data[el].length - 1; j++) {
                            if ((data[el][i].name).toLowerCase() == (data[el][j].name).toLowerCase()) {
                                rej("Field Definition Object contains the same name");
                            }
                        }

                    }
                }
            });
            res();
        }else{
            res();
        }
    });
};

function templateCreate(req, response) {
    var params = _crudder.swagMapper(req);
    var templateData = params["data"];
    templateData.createdBy = req.user.username;
    if(templateData.isQueryBased && templateData.query)
    {
        // templateData.query=JSON.stringify(templateData.query);
        templateData.query=templateData.query.replace(/\s\s+/g, "").replace(/[\n\r]/g,"");
    }
    templateData.createdAt = Date.now();
    response.set("Content-Type", "application/json");
    validate(params["data"])
        .then(() => createTemplate(templateData))
        .then(res => {
            response.set("Content-Type", "application/json");
            response.status(201).send(res);
        })
        .catch(err => {response.status(400).send({ "error": err.toString() });});

}

function fetchTemplate(req, res) {
    getAllTemplates()
        .then(obj => {
            if (obj.length > 0) {
                res.set("Content-Type", "application/json");
                res.status(200).send(obj);
            }
            else {
                res.set("Content-Type", "application/json");
                res.status(400).send("Export Templates Not Found");
            }
        }
        )
        .catch(err=>{
            res.set("Content-Type", "application/json");
            res.status(400).send(err);
        });

}

function templateDelete(req, res) {
    var params = _crudder.swagMapper(req);
    Delete(params["id"]).then(obj => {
        res.set("Content-Type", "application/json");
        res.status(200).send({ msg: "Template Deleted Successfully" });
    })
    .catch(err => {
        res.set("Content-Type", "application/json");
        res.status(400).send(err);
    });
    // getTemplateById(params["id"])
    //     .then(responseobj => {
    //         console.log("The Object is--->",responseobj);
    //         responseobj.deleted = true;
    //         responseobj.save((obj, err) => {
    //             if (err) {
    //                 res.set('Content-Type', 'application/json');
    //                 res.status(400).send(err);
    //             }
    //             else {
    //                 res.set('Content-Type', 'application/json');
    //                 res.status(200).send(responseobj);
    //             }
    //         })
    //     });
}

function templatebyId(req, res) {
    var params = _crudder.swagMapper(req);
    getTemplateById(params["id"])
        .then(responseobj => {
            res.set("Content-Type", "application/json");
            res.status(200).send(responseobj);
        }).catch(err=>{
            res.status(400).send(err);
        });
}

function updateTemplate(req, res) {
    var params = _crudder.swagMapper(req);
    /**userType is adding while Updating the Template */
    params["data"].userType=params["data"].userType?params["data"].userType:" ";
    updateModel(params["id"], params["data"])
        .then(obj => {
            res.set("Content-Type", "application/json");
            res.status(200).send(obj);
        }).catch(err=>{
            res.status(400).send(err);
        });

}

module.exports.init = init;
module.exports.templateCreate = templateCreate;
module.exports.fetchTemplate = fetchTemplate;
module.exports.templateDelete = templateDelete;
module.exports.templatebyId = templatebyId;
module.exports.updateTemplate = updateTemplate;