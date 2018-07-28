/*globals module*/

var exportReporttemplate = {
    _id:
    {
        type: String,
        default: null
    },
    templateName:
    {
        type: String
    },
    templateDescription:
    {
        type: String
    },
    templateType: {
        type: String,
        enum: ["export", "import"],
        default: "import"
    },
    outputType:
    {
        type: String,
        enum: ["csv", "xml", "json", "xls"]
    },
    userType:
    {
        /**This i am not making default because if they explicitly assign the type then i validate
         * else i want to return false.please Dont ever change default values for this.
         */
        type: String,
        enum: ["Employee", "Franchise", "Seller", " "],
        default: " "
    },
    collectionName:
    {
        type: String
    },
    createdBy: {
        type: String
    },
    createdAt: {
        type: Date
    },
    deleted: {
        type: Boolean,
        default: false
    },
    fieldDefinition:
    [
        {
            name: {
                type: String
            },
            type: {
                type: String,
                enum: ["String", "Number", "Boolean", "Date", "DateTime", "DateRange", "DateRangeTime"]
            },
            isGrouped: {
                type: Boolean,
                default: false
            },
            operation: {
                type: String
            },
            format: {
                type: String
            },
            column: {
                type: String
            },
            min: {
                type: String
            },
            isPrimaryKey: {
                type: String
            },
            method: {
                type: String
            },
            alias:
            [
                {
                    name: { type: String },
                    type: { type: String },
                    value: { type: String }

                }
            ],
            groupedFieldOperation:
            {
                type: String,
                enum: ["none", "sum", "avg", "min", "max", "count", "join", "distinct"],
                default: "none"
            },
            isShow:
            {
                type: Boolean
            },
            dynamicColumn: {
                isDynamicCol: { type: Boolean },
                value: { type: String }
            },
            isForeignKey: {
                type: Boolean,
                default: false
            },
            _collectionName: {
                type: String
            },
            isSecondaryCol: {
                type: Boolean,
                default: false
            }
        }
    ],
    limit: {
        type: Number
    },
    path: {
        type: String
    },
    inputFilters:
    [
        {
            name: {
                type: String
            },
            type: {
                type: String,
                enum: ["Date", "DateTime", "DateRangeTime", "String", "Number", "Text", "Textarea", "Select", "SelectMulti"]
            },
            column: {
                type: String
            },
            /**This field is added to substitute the internal value for the column that we should fetch 
            * internally and substitute it.no need to fetch using filters.example like when we want to sunstitute for id of an logged in user.
            * for this i am fetching from req.user object.if any value available in request object then we can substitute.
            */
            /**The column value should be given as _id,username,isActive,llDate,isSeller,employee,warehouses,
             * notification: { 'Account Creation': true, 'Reset Password': false }
             * image,
             * userType,resetPassword,createdAt,refId,name,roleId,enableOtp,platform,iat,exp,groups
             * ensure give only this fields as of now
             */
            isShow: {
                type: Boolean
            }
        }
    ],
    isQueryBased: {
        type: Boolean,
        default: false
    },
    queryFrom: {
        type: String,
        enum: ["mongo", "Elastic"],
        default: "mongo"
    },
    environment: {
        type: String,
        enum: ["archive", "production"],
        default: "archive"
    },
    header: {
        rowFrom: { type: Number },
        columnStart: { type: Number },
        text: { type: String }
    },
    body: {
        rowFrom: { type: Number },
        columnStart: { type: Number },
        text: { type: String }
    },
    footer: {
        rowFrom: { type: Number },
        columnStart: { type: Number },
        text: { type: String }
    },
    assignedUser: [{
        type: String
    }],
    query: {
        type: String
    },
    isScheduleReport: {
        type: Boolean,
        default: false
    },
    scheduleType: {
        type: String,
        enum: ["Daily", "Weekely", "Monthly"],
        default: "Daily"
    },
    scheduledTime: {
        type: Date
    },
    emailIds: [{
        type: String
    }],
    emailSubject: {
        type: String
    },
    emailBody: {
        type: String
    }
};

module.exports.exportReporttemplate = exportReporttemplate;