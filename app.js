const fs = require('fs');
const ClassLoader = require('./lib/class_loader');
const JavaEmulator = require('./lib/emulator');
let ancestry = {};
let dependency = {};

function includes (array, element) {
    return array.indexOf(element) > -1;
}

function markCalledClass(classLoader, thisClass, thatClass) {
    if (!thatClass) {
        return;
    }
    if (classLoader.isSimpleArray(thatClass)) {
        return;
    }
    thatClass = thatClass.replace(/^\[*L|;$/g, '');
    if(thisClass == thatClass || thatClass.startsWith("java")) {
        return;
    }
    classLoader.markJarInUse(thatClass);
    let demangledThisClass = thisClass.replace(/\//g,'.');
    let demangledThatClass = thatClass.replace(/\//g,'.');

    if (!loader.classes[thatClass]) {
        if (!includes(classes, thatClass)) {
            classes.push(thatClass);
        }
        loader.getClass(thatClass, true);
    }

    let thisJar = loader.getJarNameByClassName(thisClass) || 'application';
    let thatJar = loader.getJarNameByClassName(thatClass);

    if (thatJar) {
        dependency[thisJar] = dependency[thisJar] || {uses: []};
        if (!includes(dependency[thisJar].uses, thatJar)) {
            dependency[thisJar].uses.push(thatJar);
        }
    }

    ancestry[demangledThisClass] = ancestry[demangledThisClass] || {calling: {}};
    ancestry[demangledThisClass].calling = ancestry[demangledThisClass].calling || {};
    ancestry[demangledThisClass].calling[demangledThatClass] = true;

    ancestry[demangledThatClass] = ancestry[demangledThatClass] || {calledBy: {}};
    ancestry[demangledThatClass].calledBy = ancestry[demangledThatClass].calledBy || {};
    ancestry[demangledThatClass].calledBy[demangledThisClass] = true;

}

console.time('bigClassLoad');
let amazonS3 = loader.getClass("com/amazonaws/services/s3/AmazonS3Client");
console.timeEnd('bigClassLoad');

// process.exit(0);
let processedClasses = 0;
let classes = Object.keys(loader.classes);
console.log(`Loaded ${classes.length} classes...`)

while(classes.length) {
    let className = classes.shift();
    processedClasses++;
    let demangledClassName = className.replace(/\//g,'.');
    let ca = loader.getClass(className, true);
    if (!ca) {
        continue;
    }

    // if (processedClasses % 100 == 0) {
        loader.logWarning(`Done: ${processedClasses}, Left: ${classes.length}, Now: ${className}`);
    // }

    let parentClassName = ca.getSuperClassName().replace(/\//g,'.');

    // TODO: Add superclass to ancestry
    ancestry[demangledClassName] = ancestry[demangledClassName] || {inheritedFrom: []};
    ancestry[demangledClassName].inheritedFrom = ancestry[demangledClassName].inheritedFrom || [];
    ancestry[demangledClassName].inheritedFrom.push(parentClassName);

    ancestry[parentClassName] = ancestry[parentClassName] || {inheritedBy: []};
    ancestry[parentClassName].inheritedBy = ancestry[parentClassName].inheritedBy || [];
    ancestry[parentClassName].inheritedBy.push(demangledClassName);

    let thisJar = loader.getJarNameByClassName(className) || 'application';
    let thatJar = loader.getJarNameByClassName(parentClassName);

    if (thatJar) {
        dependency[thisJar] = dependency[thisJar] || {uses: []};
        if (!includes(dependency[thisJar].uses, thatJar)) {
            dependency[thisJar].uses.push(thatJar);
        }
    }

    let externalClasses = ca.getExternalClasses();

    externalClasses && externalClasses.forEach(extClass => {
        markCalledClass(loader, className, extClass);
    });
}


console.log(JSON.stringify(ancestry, null, 2));
console.log('JAR dependency: ' + JSON.stringify(dependency, null, 2));
console.log('JARs status: ' + JSON.stringify(loader.jars, null, 2));
