const fs = require('fs');
const ClassLoader = require('./lib/class_loader');
const JavaEmulator = require('./lib/emulator');
let ancestry = {};
let dependency = {};

class ClassProcessor {
    classLoader = null;
    dependency = {};
    ancestry = {};
    classesToProcess = null;

    recordRelationship(thisClass, thatClass, callingField = "calling", calledByField = "calledBy") {
        if (!thatClass) {
            return;
        }
        if (this.classLoader.isSimpleArray(thatClass)) {
            return;
        }
        thatClass = thatClass.replace(/^\[*L|;$/g, '');
        if(thisClass == thatClass || thatClass.startsWith("java")) {
            return;
        }
        this.classLoader.markJarInUse(thatClass);
        let demangledThisClass = thisClass.replace(/\//g,'.');
        let demangledThatClass = thatClass.replace(/\//g,'.');

        if (!this.classLoader.classes[thatClass]) {
            if (!this.classesToProcess.includes(thatClass)) {
                this.classesToProcess.push(thatClass);
            }
            this.classLoader.getClass(thatClass, true);
        }

        let thisJar = this.classLoader.getJarNameByClassName(thisClass) || 'application';
        let thatJar = this.classLoader.getJarNameByClassName(thatClass);

        if (thatJar) {
            this.dependency[thisJar] ||= {uses: []};
            if (!this.dependency[thisJar].uses.includes(thatJar)) {
                this.dependency[thisJar].uses.push(thatJar);
            }
        }

        this.ancestry[demangledThisClass] ||= {};
        this.ancestry[demangledThisClass][callingField] ||= {};
        this.ancestry[demangledThisClass][callingField][demangledThatClass] = true;

        this.ancestry[demangledThatClass] ||= {};
        this.ancestry[demangledThatClass][calledByField] ||= {};
        this.ancestry[demangledThatClass][calledByField][demangledThisClass] = true;

    }

    async process(dirName) {
        console.time('bigClassLoad');
        this.classLoader = new ClassLoader();
        await this.classLoader.loadAllJarFiles(dirName);
        console.timeEnd('bigClassLoad');

        // process.exit(0);
        let processedClasses = 0;
        this.classesToProcess = Object.keys(this.classLoader.classes);
        console.log(`Loaded ${this.classesToProcess.length} classes...`)

        while(this.classesToProcess.length) {
            let className = this.classesToProcess.shift();
            processedClasses++;
            let ca = await this.classLoader.getClass(className, true);
            if (!ca) {
                continue;
            }

            if (processedClasses % 100 == 0) {
                this.classLoader.logWarning(`Done: ${processedClasses}, Left: ${this.classesToProcess.length}, Now: ${className}`);
            }

            this.recordRelationship(className, ca.superClassName, "inheritedFrom", "inheritedBy");

            for (let method of ca.methods) {
                let emulator = new JavaEmulator(this.classLoader, ca);
                emulator.on('invoke', (from, to) => {
                    this.recordRelationship(from, to, "calling", "calledBy");
                });
                emulator.on('field_access', (from, to) => {
                    this.recordRelationship(from, to, "calling", "calledBy");
                });
                await emulator.emulateMethod(method);
            }
            let externalClasses = ca.externalClasses;

            if (externalClasses) {
                for (let extClass of externalClasses) {
                    this.recordRelationship(className, extClass, "calling", "calledBy");
                }
            }


        }


        console.log(JSON.stringify(this.ancestry, null, 2));
        console.log('JAR dependency: ' + JSON.stringify(this.dependency, null, 2));
        console.log('JARs status: ' + JSON.stringify(this.classLoader.jars, null, 2));
    }
}

let processor = new ClassProcessor();

processor.process("./data/");