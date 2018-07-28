var reportLog = {
    templateId:{
        type:String
    },
    templateName:
    {
        type: String
    },
    createdAt:{
        type: Date
    },
    userAssigned:
    {//this is userName
        type:String
    },
    deleted:{
        type:Boolean,
        default:false
    },
    fileOutputType:{
        type:String
    },
    downloadLink:{
        type:String
    },
    filename:{
        type:String
    }
};

module.exports.reportLog = reportLog;