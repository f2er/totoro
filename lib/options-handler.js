'use strict';

var path = require('path')
var fs = require('fs')
var hogan = require('hogan.js')

var logger = require('./logger')
var utils = require('./utils')
var availableAdapters = require('./client/adapt').availableAdapters


var ip = utils.getExternalIpAddress()

var clientCfg = {
    tests: undefined,
    runner: undefined,
    adapter:undefined,
    override: false,
    browsers: ['chrome', 'firefox', 'safari', 'ie/9', 'ie/8', 'ie/7', 'ie/6'],
    clientRoot: undefined,
    timeout: 5,
    clientHost: ip,
    clientPort: '9998',
    serverHost: '10.15.52.87',
    serverPort: '9999'
}

var serverCfg = {
    serverHost : ip,
    serverPort : '9999',
    insertScripts: []
}

// parse config
var globalCfg = getCfg(path.join(utils.home, '.totoro', 'config.json'))
var projectCfg = getCfg(path.join(process.cwd(), 'totoro-config.json'))

mixCfg(clientCfg, globalCfg)
mixCfg(clientCfg, projectCfg)

mixCfg(serverCfg, globalCfg)
mixCfg(serverCfg, projectCfg)

exports.getServerCfg = function(commander) {
    mixCommander(serverCfg, commander)
    return serverCfg
}

exports.getClientCfg = function(commander) {
    mixCommander(clientCfg, commander)
    handleRunnerOption(clientCfg)
    var adapter = clientCfg.adapter

    if (adapter) {
        if (availableAdapters.indexOf(adapter) < 0 && !utils.isAbsolute(adapter)) {
            clientCfg.adapter = path.join(process.cwd(), adapter)
        }
    }

    if (!clientCfg.clientRoot) {
        clientCfg.clientRoot = guessRoot(clientCfg.testsDir)
    } else {
        clientCfg.clientRoot = path.resolve(clientCfg.clientRoot)
    }
    return clientCfg
}

exports.getListCfg = function(commander) {
    mixCommander(clientCfg, commander)
    return clientCfg
}

function guessRoot(testsDir) {
    // TODO
    var root = path.join(path.resolve(testsDir), '../')
    logger.debug('guess root is "' + root + '"')
    return root
}

function mixCommander(cfg, commander) {
    Object.keys(cfg).forEach(function(key) {
        if (commander[key]) {
            cfg[key] = commander[key]
        }
    })
    return cfg
}

function mixCfg(target, src) {
    utils.mix(target, src, true)
}

function getCfg(cfgPath) {
    var cfg = null
    if (!fs.existsSync(cfgPath)) {
        return {}
    }

    cfg = fs.readFileSync(cfgPath) + ''

    if (!cfg) {
        return {}
    }

    try {
        cfg = JSON.parse(fs.readFileSync(cfgPath))
    } catch(e) {
        logger.warn('parse global config error! (' + cfgPath + ')')
    }
    return cfg || {}
}

function handleRunnerOption(cfg) {
    if (cfg.runner) {
        logger.debug('specified runner "' + cfg.runner + '" .')
        cfg.runner = checkRunner(cfg.runner)
    } else {
        logger.debug('not specified runner, will find out runner.')
        cfg.testsDir = findTestsDir()
        cfg.runner = findRunner(cfg.testsDir)
    }

    if (cfg.runner) {
        if (cfg.overwrite) {
            logger.debug('overwrite existed runner.')
            cfg.runner = createRunner(cfg.testsDir, cfg.tests, cfg.runner)
        }
    } else {
        cfg.autoRunner = true
        cfg.runner = createRunner(cfg.testsDir, cfg.tests)
        logger.debug('create runner: "' + cfg.runner + '".')
    }
    return cfg
}

function checkRunner(runner) {
    var exists = fs.existsSync(runner)
    if (exists) {
        if (path.extname(runner) !== '.html') {
            logger.error('runner "' + runner + '" is not a html file.')
        }
    } else {
        logger.error('runner "' + runner + '" not exists.')
    }
    return path.resolve(runner)
}


function findRunner(testsDir) {
    var runner1 = path.join(testsDir, 'runner.html')
    var runner2 = path.join(testsDir, 'index.html')
    if (fs.existsSync(runner1)) {
        logger.debug('found runner "' + runner1 + '"')
        return runner1
    } else if (fs.existsSync(runner2)) {
        logger.debug('found runner "' + runner2 + '"')
        return runner2
    } else {
        logger.debug('not found runner.')
    }
}


function findTestsDir() {
    var dir
    var cwd = process.cwd()
    var dir1 = path.join(cwd, 'test')
    var dir2 = path.join(cwd, 'tests')
    if (cwd.match(/tests?$/g)) {
        dir = cwd
    } else if (fs.existsSync('test')) {
        dir = dir1
    } else if (fs.existsSync('tests')) {
        dir = dir2
    }
    if (dir) {
        logger.debug('found tests dir "' + dir +'"')
        return dir
    } else {
        logger.error('not found test dir.')
    }
}

function createRunner(testsDir, tests, runner) {
    runner = runner || path.join(testsDir, 'runner.html')
    if (tests) {
        logger.debug('specified tests.')
        if (typeof tests === 'string') {
            tests = [tests]
        }
        var rawTests = tests
        tests = []
        rawTests.forEach(function(file, idx, list) {
            if (fs.existsSync(file)) {
                tests.push(file)
            } else {
                logger.warn('test script "' + file + '" not exists.')
            }
        })
        if (!tests.length) {
            logger.error('all specified are invalid tests.')
        }
    } else {
        logger.debug('search test scripts in dir "' + testsDir + '"')
        tests =  findTests(testsDir)
    }
    var testStyle = findTestStyle(tests)
    var useDeps = JSON.stringify(tests.map(function(f) {
        return './' + path.relative(testsDir, f)
    }))
    var alias = findAlias(testsDir)
    var info = {
        testStyle: testStyle,
        alias: alias,
        useDeps: useDeps
    }
    renderRunner(runner, info)
    logger.debug('render runner "' + runner + '"')
    return runner
}


function findTests(testsDir) {
    var tests = utils.findFiles(testsDir, /^.*(test|spec).*\.js$/i)
    if (tests.length === 0) {
        logger.error('not found tests in "' + testsDir + '"')
    }
    return tests
}


function findTestStyle(tests) {
    // TODO
    return 'bdd'
}

var defaultAlias = {
    $: 'gallery/jquery/1.7.2/jquery',
    jquery: 'gallery/jquery/1.7.2/jquery',
    expect: 'gallery/expect/0.2.0/expect',
    sinon: 'gallery/sinon/1.6.0/sinon',
    'event-simulate': 'arale/event-simulate/1.0.0/event-simulate'
}

function findAlias(testsDir) {
    var pkgPath = path.join(testsDir, '..', 'package.json')
    var pkgStr = fs.existsSync(pkgPath) ? fs.readFileSync(pkgPath) : '{}'
    var pkg = JSON.parse(pkgStr)
    var alias = pkg.dependencies || {}
    alias = utils.mix(alias, defaultAlias)
    // TODO 1.handle devDependencies 2.split alias into js alias and css alias
    return JSON.stringify(alias)
}

function renderRunner(p, info) {
    var templPath = path.join(__dirname, '..', '..', 'static', 'runner.html')
    var tmpl = hogan.compile(fs.readFileSync(templPath) + '')
    fs.writeFileSync(p, tmpl.render(info), 'utf-8')
}
