var mongojs = require("mongojs"),
    url = process.env.MONGO_URL ? process.env.MONGO_URL : "mongodb://localhost/storeKing",
    url=encodeURIComponent(url),
    connection,
    getConnection;

getConnection = function getConnection() {
    if (connection) {
        return connection;
    } else {
        console.log("Connection Established");
        connection = mongojs(url);
        return connection;
    }
};

var getUrl = function getConnection() {
    return decodeURIComponent(url);
};

module.exports.getConnection = getConnection;
module.exports.getUrl = getUrl;
