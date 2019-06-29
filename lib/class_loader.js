const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const ClassReader = require('./class_reader');
const ConstantPoolReader = require('./constant_pool_reader');

class ClassLoader {
    constructor(constantPoolOnly) {
        this.paths = [ __dirname ];
        this.classRegistry = {};
        this.classes = {};
        this.jars = [];
        this.constantPoolOnly = !!constantPoolOnly;
    }

    logWarning(logEntry) {
        logEntry = new Date().toLocaleString() + ": " + logEntry + "\n";
        console.log(logEntry);
    }
    
    addPath(path) {
        if (this.paths.indexOf(path) === -1) {
            this.paths.push(path);
        }
    }

    addClasspath(path) {
        this.addPath(path);
    }

    markJarInUse(className) {
        if (this.classRegistry[className]) {
            let jarIndex = this.classRegistry[className];
            this.jars[jarIndex].inUse = true;
        }
    }

    getJarNameByClassName(className) {
        if (this.classRegistry[className]) {
            let jarIndex = this.classRegistry[className];
            return this.jars[jarIndex].fileName;
        }
        return null;
    }

    loadClassBytes(bytes) {
        let classObject = this.constantPoolOnly ? new ConstantPoolReader(bytes) : new ClassReader(bytes);
        classObject.read();
        this.classes[classObject.getClassName()] = classObject;
        return classObject;
    }

    findPathInternal(prependedPath, appendedPath) {
        prependedPath = path.normalize(prependedPath);
        appendedPath = path.normalize(appendedPath);

        let ppData = prependedPath.split(path.sep);
        let result = '';
        for (let ppIdx = ppData.length - 1; ppIdx > 0; ppIdx--) {
            result = ppData.join(path.sep) + path.sep + appendedPath;
            if (fs.existsSync(result)) {
                return result;
            }
            ppData.pop();
        }
        return null;
    }

    findPath(prependedPath, appendedPath) {
        let filepath = null;

        for(let idx = 0; idx < this.paths.length; idx++) {
            classpath = this.paths[idx];
            filepath = path.normalize(classpath) + path.sep + path.normalize(appendedPath);
            if (fs.existsSync(filepath)) {
                return filepath;
            }
        }

        filepath = this.findPathInternal(prependedPath, appendedPath);

        return filepath;
    }

    loadClassFromJar(className) {
        // console.debug("loading class " + className + " ...");
        let classData = this.classes[className];
        if (classData) {
            return classData;
        }

        if (className.match(/^javax?\/|^\[/)) {
            return null;
        }

        let jarIndex = this.classRegistry[className];
        if (jarIndex === undefined) {
            this.logWarning(`WARNING: Class '${className}' is not found in the CLASSPATH.`);
            return null;
        }
        let classPath = this.jars[jarIndex].fileName;
        if (!classPath) {
            if (!className.match("^javax?/")) {
                // console.error(`Class ${className} cannot be found in the paths defined in the CLASSPATH. Please add the path and try again.`);
            }
            return null;
            // process.exit(1);
        }

        classData = null;
        if (fs.existsSync(classPath)) {
            if (classPath.endsWith('.jar')) {
                let zip = new AdmZip(classPath);
                classData = zip.readFile(`${className}.class`);
                // TODO: Add callback here.
            } else {
                classData = fs.readFileSync(classPath);
            }

            let ca = this.loadClassBytes(classData);

            return ca;
        } else {
            if (!className.match("^javax?/")) {
                // console.error(`Class ${className} cannot be found in the paths defined in the CLASSPATH. Please add the path and try again.`);
            }
            return null;
            // process.exit(1);
        }
    }

    loadClassFile(fileName) {
        // console.debug("loading " + fileName + " ...");
        let bytes = fs.readFileSync(fileName);
        let ca = this.loadClassBytes(bytes);
        if (!this.constantPoolOnly) {
            let classes = ca.getClasses();
            for (let i=0; i<classes.length; i++) {
                if (!this.classes[classes[i]]) {
                    this.getClass(classes[i], true);
                }
            }
        }
        return ca;
    }

    indexJarFile(fileName) {
        let self = this;
        let AdmZip = require("adm-zip");
        let zip = new AdmZip(fileName);
        if (this.jars.indexOf(fileName) > -1) {
            this.logWarning(`WARNING! Jar file '${fileName}' was already added.`);
        }
        this.jars.push({fileName, inUse: false});
        let jarIndex = this.jars.length - 1;
        let zipEntries = zip.getEntries();
        zipEntries && zipEntries.forEach(function(zipEntry) {
            if (!zipEntry.isDirectory) {
                if (path.extname(zipEntry.entryName) === ".class") {
                    // console.debug("indexing " + fileName + '@' + zipEntry.entryName + " ...");
                    let className = zipEntry.entryName.substring(0, zipEntry.entryName.lastIndexOf('.'));
                    if (self.classRegistry[className]) {
                        let jarFile = self.jars[self.classRegistry[className]].fileName;
                        self.logWarning(`${fileName} -> WARNING! Jar file '${className}' was already defined in ${jarFile}.`);
                    } else {
                        self.classRegistry[className] = jarIndex;
                    }
                }
            }
        });    
    }

    isSimpleArray(className) {
        return className.startsWith('[') && !className.match(/^\[+L/);
    }

    getClass(className, doNotThrow) {

        if(this.isSimpleArray(className)) {
            return null;
        }

        className = className.replace(/^\[*L|;$/g, '');
    
        let ca = this.classes[className];
        if (ca) {
            return ca;
        }
        this.paths.forEach( path => {
            let fileName = `${path}/${className}.class`;
            if(fs.existsSync(fileName)) {
                return this.loadClassFile(fileName);
            }
        });

        let classData = this.loadClassFromJar(className);

        if (classData) {
            return classData;
        }

        if (!doNotThrow) {
            throw new Error(`Implementation of the ${className} class is not found.`);
        // } else {
        //     console.log(`Implementation of the ${className} class is not found.`);
        }
    }

    loadClassFiles(dirName) {
        let self = this;
        self.addPath(dirName);
        let files = fs.readdirSync(dirName);
        files.forEach(function(file) {
            let p = path.normalize(`${dirName}/${file}`);
            let stat = fs.statSync(p);
            if (stat.isFile()) {
                if (path.extname(file) === ".class") {
                    self.loadClassFile(p);
                }
            } else if (stat.isDirectory()) {
                self.loadClassFiles(p);
            }
        });
    }
    
    indexJarFiles(dirName) {
        let self = this;
        self.addPath(dirName);
        let files = fs.readdirSync(dirName);
        files.forEach(function(file) {
            let p = path.normalize(`${dirName}/${file}`);
            let stat = fs.statSync(p);
            if (stat.isFile()) {
                if (path.extname(file) === ".jar") {
                    self.indexJarFile(p);
                }
            } else if (stat.isDirectory()) {
                self.indexJarFiles(p);
            }
        });
    }
    
}

module.exports = ClassLoader;