var Util = require('util');
var FS = require('fs');
var dateformat = require('dateformat');
var ANSI = require('ansi');
var cursor = ANSI(process.stdout);
var sprintf = require('sprintf');

//////////////////////////////////////////////////////////////////////////////

function LoggerBase(defaultContext)
{
    this.defaultContext = defaultContext || "";

    this.queue = [];

    this.dateFormat = 'HH:MM:ss';

    this.ERROR = 'error';
    this.WARNING = 'warning';
    this.INFO = 'info';
    this.DEBUG = 'debug'
    this.TRACE = 'trace';

    // bind all __ prefixed functions to this(this,..)
    for (var fn in this)
    {
        if (typeof this[fn] == 'function' && fn.match(/^__/))
            this[fn.substring(2)] = this[fn].bind(this, this);
    }

    this.ping();
}

LoggerBase.prototype.__contextualize = function (me, context, append) // virtual LoggerBase (string context, bool append = false)
{
    var ctx;
    if (append !== true) ctx = context;
    else
    {
        if (me.defaultContext.length) ctx = me.defaultContext + ": " + context;
        else ctx = context;
    }
    return new ContextualizedLogger(me, ctx);
/*
    var f = new me.constructor();
    if (append !== true)
        f.defaultContext = context;
    else
    {
        if (me.defaultContext.length)
            f.defaultContext = me.defaultContext + ": " + context;
        else
            f.defaultContext = context;
    }
    return f;
*/
}

/**
 * Create real array out of $(arguments), optionally skipping some
 * leading elements.
 */
LoggerBase.prototype.__args = function (me, args, skip)
{
    var nargs = [];
    for (var i = skip; args.length > i; i++) nargs.push(args[i]);
    return nargs;
}

/**
 * The method that should be called to log something. Args must be an array here.
 */
LoggerBase.prototype.__log = function (me, level, vars, args)
{
    // preprocess vars
    if (typeof vars != 'object')
    {
        vars = { context: vars }
    }
    vars.when = new Date()

    // filter?
    if (me.filter(level, vars, args))
    {
        // enqueue!
        me.enqueue(level, vars, args);
    }
}

/**
 * Filter the log messages. Return true/false
 */
LoggerBase.prototype.__filter = function (me, level, vars, args)
{
    // default implementation = include all
    return true;
}

/**
 * Enqueue a message for logging after it has been filtered
 */
LoggerBase.prototype.__enqueue = function (me, level, vars, args)
{
    if (me.useQueue === false)
    {
        me.output(level, vars, args);
    }
    else
    {
        me.queue.push({ level: level, vars: vars, args: args });
        me.ping();
    }
}

/**
 * Continue processing the queue
 */
LoggerBase.prototype.__ping = function (me)
{
    if (me.useQueue === false) return;

    function reschedule()
    {
        if (me.queue.length > 0)
            setImmediate(me.ping);

        //me.timeout = null;
        //setImmediate(me.ping);
        //process.nextTick(function() { me.ping() });
    }

    if (me.busy !== true && me.timeout == null)
    {
        if (me.queue.length > 0)
        {
            var msg = me.queue.shift();
            me.busy = true;
            try
            {
                me.output(msg.level, msg.vars, msg.args, function()
                {
                    me.busy = false;
                    reschedule();
                });
            }
            catch (e)
            {
                me.busy = false;
                reschedule();
            }
        }
    }
}

/**
 * Flush the log queue.
 */
LoggerBase.prototype.__flush = function (me, callback)
{
    // TODO
}

//// level wrappers ////

LoggerBase.prototype.__error = function (me, args)
{
    me.log(me.ERROR, {}, me.args(arguments, 1));
}

LoggerBase.prototype.__warning = function (me, args)
{
    me.log(me.WARNING, {}, me.args(arguments, 1));
}

LoggerBase.prototype.__info = function (me, args)
{
    me.log(me.INFO, {}, me.args(arguments, 1));
}

LoggerBase.prototype.__debug = function (me, args)
{
    me.log(me.DEBUG, {}, me.args(arguments, 1));
}

LoggerBase.prototype.__trace = function (me, args)
{
    me.log(me.TRACE, {}, me.args(arguments, 1));
}

//// actual implementation

LoggerBase.prototype.__formatArg = function (me, arg)
{
    if (arg instanceof Error)
        return JSON.stringify({ "err": { name: arg.name, message: arg.message } });
    else if (typeof arg == 'object')
        return JSON.stringify(arg)
    else
        return arg;
}

LoggerBase.prototype.__cookArgs = function (me, args)
{
    return (args instanceof Array) ? args.map(me.formatArg).join(" ") : args;
}

LoggerBase.prototype.__format = function (me, level, vars, args)
{
    if (args == null && vars != null) { args = vars; vars = null; }
    var s = "[" + level + "] ("
        + (vars ? (typeof vars == 'string' ? vars : (vars.context || this.defaultContext)) : this.defaultContext)
        + ") "
        + me.cookArgs(args);

    return s;
}

LoggerBase.prototype.__output = function (me, level, vars, args, callback)
{
    // empty default - this is where the actual logging should take place
}

function ContextualizedLogger(parentLogger, context)
{
    this.useQueue = false;
    LoggerBase.call(this, context);
    this.logger = parentLogger;
    this.defaultContext = context;
}
Util.inherits(ContextualizedLogger, LoggerBase);

ContextualizedLogger.prototype.__log = function (me, level, vars, args)
{
    if (typeof vars != 'object') vars = { context: vars };
    if (vars.context == null) vars.context = me.defaultContext;
    me.logger.log(level, vars, args);
}

//////////////////////////////////////////////////////////////////////////////

function ConsoleLogger(defaultContext)
{
    LoggerBase.call(this, defaultContext);
}
Util.inherits(ConsoleLogger, LoggerBase)

ConsoleLogger.prototype.__output = function (me, level, vars, args, callback)
{
    switch (level)
    {
        case me.ERROR:
        case me.WARNING:
            console.error(me.format(level, vars, args));
        default:
            console.log(me.format(level, vars, args));
    }
    if (typeof callback == 'function') callback();
}

//////////////////////////////////////////////////////////////////////////////

function ColoredConsoleLogger(defaultContext)
{
    LoggerBase.call(this, defaultContext);
    this.colors = {};
    this.colors[this.ERROR] = "red";
    this.colors[this.WARNING] = "yellow";
    this.colors[this.INFO] = "green";
    this.colors[this.DEBUG] = "cyan";
    this.colors[this.TRACE] = "grey";
    this.colors['*'] = "grey";
}
Util.inherits(ColoredConsoleLogger, LoggerBase)

function rpad (str, len)
{
    for (var i = str.length; len > i; i++) str += ' ';
    return str;
}

ColoredConsoleLogger.prototype.__output = function (me, level, vars, args, callback)
{
    if (args == null && vars != null) { args = vars; vars = null; }

    var ctx = (vars ? (typeof vars == 'string' ? vars : (vars.context || this.defaultContext)) : this.defaultContext);

    var lev = rpad(level.toUpperCase(), 7);

    var levColor = me.colors[level] || me.colors['*'];

    cursor.cyan().write('').write(dateformat(vars.when, this.dateFormat)).write('')
        .grey().write(' [')
        [levColor]().write(lev).grey().write('] ')
        .grey().write(ctx).write(' ')
        .reset().write(me.cookArgs(args))
        .reset().write("\n");

    //cursor.write(lev).grey().write('] ').cyan().write(ctx).write(' ').reset().write(args.map(nice).join(" ")).reset().write("\n");
    //cursor.write(lev).grey().write('] ').reset().write(args.map(nice).join(" ")).cyan().write(' ').write(ctx).reset().write("\n");

    if (typeof callback == 'function') callback();
}

//////////////////////////////////////////////////////////////////////////////

function NullLogger(defaultContext)
{
    LoggerBase.call(this, defaultContext);
}
Util.inherits(NullLogger, LoggerBase)

NullLogger.prototype.__log = function () { }
NullLogger.prototype.__output = function () { }
NullLogger.prototype.__error = function () { }
NullLogger.prototype.__warning = function () { }
NullLogger.prototype.__info = function () { }
NullLogger.prototype.__debug = function () { }
NullLogger.prototype.__trace = function () { }

//////////////////////////////////////////////////////////////////////////////

function FileLogger(defaultContext, options)
{
    var me = this;
    if (options == null && typeof defaultContext == 'object')
    {
        options = defaultContext;
        defaultContext = "";
    }
    if (options == null) throw new Error("options must be specified");
    LoggerBase.call(this); // inherited c'tor

    me.filenameDateFormat = options.filenameDateFormat || "yyyymmdd";
    me.filename = options.filename || "output.log";
    me.prefix = options.prefix || "";
    me.encoding = options.encoding || "UTF-8";
}
Util.inherits(FileLogger, LoggerBase);

FileLogger.prototype.__output = function (me, level, vars, args, callback)
{
    try
    {
        var fn = me.filename
            .replace('__DATE__', dateformat(vars.when, me.filenameDateFormat))
            .replace('__PREFIX__', me.prefix);

        var s = vars.when.toISOString() + "\t"
			    + level + "\t"
                + vars.context + "\t"
			    + me.cookArgs(args).replace('\\', '\\\\').replace('\t', '\\t').replace('\n', '\\n').replace('\r', '\\r')
			    + "\r\n";

        FS.appendFile(fn, s, function(err)
        {
            if (typeof callback == 'function') callback();
        });
    }
    catch (e)
    {
        console.error(e);
    }
}

//////////////////////////////////////////////////////////////////////////////

function TeeLogger(defaultContext, loggers)
{
    this.useQueue = false;
    LoggerBase.call(this, ""); // inherited c'tor
    if (loggers == null && typeof defaultContext != 'string')
    {
        loggers = defaultContext;
        defaultContext = "";
    }
    if (! loggers instanceof Array) throw new Error("loggers must be an array");
    this.loggers = loggers;
}
Util.inherits(TeeLogger, LoggerBase);

TeeLogger.prototype.__output = function (me, level, vars, args, callback)
{
    for (var i=0; me.loggers.length>i; i++)
    {
        me.loggers[i].log(level, vars, args);
    }
    if (typeof callback == 'function') callback();
}

//////////////////////////////////////////////////////////////////////////////

module.exports =
{
    LoggerBase: LoggerBase,
    NullLogger: NullLogger,
    ConsoleLogger: ColoredConsoleLogger,
    FileLogger: FileLogger,
    TeeLogger: TeeLogger
}