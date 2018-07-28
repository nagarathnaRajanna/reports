'use strict';

var SwaggerExpress = require('swagger-express-mw');
var app = require('express')();
var config = require("config");
var cuti = require("cuti");
var log4js = cuti.logger.getLogger;
log4js.configure("log4jsConfig.json",{});
var http=require('http');
var puttu = require("puttu-redis");
puttu.connect();

process.env.INTERFACE = "wlan0";
var logger = log4js.getLogger("reports");
app.locals.logger = logger;


var Mongoose = require("mongoose");
var url = process.env.MONGO_URL ? process.env.MONGO_URL : "mongodb://localhost/storeKing";
logger.trace("Connecting to DB : " + url);
Mongoose.Promise = global.Promise;
Mongoose.connect(url, function (err) { 
    if (!err) { 
        logger.info("Connected to the DB"); 
    } else { 
        logger.error("error "+ err.message); 
    } 
});

if (process.env.TEST_ENV) {
    app.locals.test = true;
    logger.warn("Detected Test environment, Cross service validations disabled");
} else {
    app.locals.test = false;
}
app.use(function(req,res,next){
    if(req.method == "OPTIONS") next();
    else if(req.headers["authorization"]){
        cuti.request.getUrlandMagicKey("user").then(options => {
            options.path = "/validateUser";
            options.headers = {
                "authorization":req.headers["authorization"],
                "content-type":"application/json"
            };
            http.request(options,response => {
                if(response.statusCode == 200){
                    var data = "";
                    response.on("data",_data => data += _data.toString("utf8"));
                    response.on("end",()=> {
                        req.user = JSON.parse(data);
                        next();});
                }
                else{
                    res.status(401).json("unauthorized");
                }
            }).end();
        }).catch(()=>{
            next();
        });        
    }
    else{
        res.status(401).json("Header is Blank");
    }
});

var logMiddleware = (req, res, next) => {
    var reqId = counter++;
    if (reqId == Number.MAX_VALUE) {
        reqId = counter = 0;
    }

    logger.info(reqId + " " + req.ip + " " +  req.method + " " + req.originalUrl);
    next();
    logger.trace(reqId + " Sending Response");
};
app.use(logMiddleware);

module.exports = app; // for testing
var counter = 0;
var config = {
  appRoot: __dirname // required config
};
var data = {};
SwaggerExpress.create(config, function(err, swaggerExpress) {
  if (err) { throw err; }
  // install middleware
  swaggerExpress.register(app);
  var port = process.env.PORT || 10040;
  // app.listen(port);
  app.listen(port,()=>{
        logger.trace("Reports server started on port number "+port);
        data.port = port;
        data.protocol = "http";
        data.api = "/reports/v1";
        //console.log(data);
        puttu.register("reports",data,process.env.INTERFACE);
    });
  // if (swaggerExpress.runner.swagger.paths['/hello']) {
  //   console.log('try this:\ncurl http://127.0.0.1:' + port + '/hello?name=Scott');
  // }
});
