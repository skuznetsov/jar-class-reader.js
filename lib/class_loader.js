const fs = require("fs").promises;
const path = require("path");
const ClassReader = require('./class_reader');
const JarReader = require('./jar_reader');
const ConstantPoolReader = require('./constant_pool_reader');

function appendUnique(arr, value) {
    if (!arr) {
        return;
    }

    if (arr.indexOf(value) > -1) {
        return;
    }

    arr.push(value);
}

class ClassLoader {
    constructor(constantPoolOnly) {
        this.paths = [ __dirname ];
        this.classRegistry = {};
        this.classes = {};
        this.jars = [];
        this.redundant_jars = [];
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
        if (className in this.classRegistry) {
            let jarIndex = this.classRegistry[className].jarIndex;
            this.jars[jarIndex].inUse = true;
        }
    }

    isJavaAPIClass(className) {
        className = className.replace("[L","").replace("[", "");
        let javaAPI = ["java.", "javax.", "org.omg.", "sun.", "com.sun." ];
        let parts = className.split(/\.|\//);
        let tld = parts[0] + '.';
        let sld = tld + parts[1] + '.';
        
        if (javaAPI.includes(tld) || javaAPI.includes(sld)) {
            return true;
        }
        return false;
    }
    
    getJarNameByClassName(className) {
        if (className in this.classRegistry) {
            let jarIndex = this.classRegistry[className].jarIndex;
            return this.jars[jarIndex].fileName;
        }
        return null;
    }

    loadClassBytes(bytes) {
        if (!bytes) {
            return null;
        }
        let classObject = this.constantPoolOnly ? new ConstantPoolReader(bytes) : new ClassReader(bytes);
        classObject.read();
        delete classObject._reader;
        this.classes[classObject.className] = classObject;
        return classObject;
    }

    async loadClassFromJar(className) {
        let classData = this.classes[className];
        if (classData) {
            return classData;
        }

        if (this.isJavaAPIClass(className)) {
            return null;
        }

        if (!(className in this.classRegistry)) {
            // this.logWarning(`WARNING: Classsss '${className}' is not found in the CLASSPATH.`);
            return null;
        }
        let classEntry = this.classRegistry[className];
        classData = classEntry.jarReader.readEntry(classEntry.zipEntry);
        let ca = this.loadClassBytes(classData);
        delete this.classRegistry[className].jarReader;
        delete this.classRegistry[className].zipEntry;
        return ca;
        // } else if (classPath.endsWith('.jar')) {
        //     let jarReader = new JarReader(classPath);
        //     this.jarCache[classPath] = jarReader;
        //     classData = await jarReader.read(`${className}.class`);
        //     let ca = this.loadClassBytes(classData);
        //     return ca;
        // }
    }

    async loadAllJarClasses(jarFile) {
        let jarReader = new JarReader(jarFile);
        let zipEntries = await jarReader.entries();
        let jarPos = -1;
        jarFile = jarFile.replace(/\//g,"\\");
        this.jars.forEach((fileEntry, idx) => {
            if (fileEntry.fileName == jarFile) {
                jarPos = idx;
            }
        });
        
        if (jarPos > -1) {
            this.jars[jarPos].inUse = true;
        } else {
            this.jars.push({fileName: jarFile, inUse: true});
            jarPos = this.jars.length - 1;
        }
        if (zipEntries && zipEntries.constructor.name == "Array") {
            for (let zipEntry of zipEntries) {
                if (!zipEntry.fileName.endsWith('/')) {
                    if (path.extname(zipEntry.fileName) === ".class") {
                        // console.debug("indexing " + fileName + '@' + zipEntry.fileName + " ...");
                        // let classData = zip.readFile(zipEntry.fileName);
                        let classData = jarReader.readEntry(zipEntry);
                        this.loadClassBytes(classData);

                        let className = zipEntry.fileName.substring(0, zipEntry.fileName.lastIndexOf('.'));
                        if (className in this.classRegistry) {
                            let jarFile = this.jars[this.classRegistry[className].jarIndex].fileName;
                            if (zipEntry.fileName != jarFile) {
                                // this.logWarning(`${fileName} -> WARNING! Class file '${className}' was already defined in ${jarFile}.`);
                                appendUnique(this.redundant_jars, zipEntry.fileName);
                            }
                        } else {
                            this.classRegistry[className] = {jarIndex: jarPos, jarReader, zipEntry};
                        }


                    }
                }
            }
        }    
    }



    async loadClassFile(fileName) {
        // console.debug("loading " + fileName + " ...");
        try {
            let bytes = await fs.readFile(fileName);
            let ca = this.loadClassBytes(bytes);
            if (!this.constantPoolOnly) {
                let classes = ca.classes;
                for (let i=0; i<classes.length; i++) {
                    if (!this.classes[classes[i]]) {
                        let reqClass = await this.getClass(classes[i], true);
                        if (!reqClass) {
                            console.log(`WARNING: ${classes[i]} is not found for ${ca.className}`);
                        }
                    }
                }
            }
            return ca;
        } catch (ex) {
            return null;
        }
    }

    async indexJarFile(fileName) {
        let jarReader = new JarReader(fileName);
        if (this.jars.indexOf(fileName) > -1) {
            this.logWarning(`WARNING! Jar file '${fileName}' was already added.`);
        }
        this.jars.push({fileName, inUse: false});
        let jarIndex = this.jars.length - 1;
        let zipEntries = await jarReader.entries();
        if (zipEntries && zipEntries.constructor.name == 'Array'){
            for(let zipEntry of zipEntries) {
                if (zipEntry.compressedSize > 0) {
                    if (path.extname(zipEntry.fileName) === ".class") {
                        let className = zipEntry.fileName.substring(0, zipEntry.fileName.lastIndexOf('.'));
                        if (className in this.classRegistry) {
                            let jarFile = this.jars[this.classRegistry[className].jarIndex].fileName;
                            if (fileName != jarFile) {
                                // this.logWarning(`${fileName} -> WARNING! Class file '${className}' was already defined in ${jarFile}.`);
                                appendUnique(this.redundant_jars, fileName);
                            }
                        } else {
                            this.classRegistry[className] = {jarIndex, jarReader, zipEntry};
                        }
                    }
                }
            }
        }
    }

    isSimpleArray(className) {
        return className.startsWith('[') && !className.match(/^\[+L/);
    }

    async getClass(className, doNotThrow) {
        if(this.isSimpleArray(className)) {
            return null;
        }

        className = className.replace(/^\[*L|;$/g, '');
    
        let ca = this.classes[className];
        if (ca) {
            return ca;
        }

        let classData = await this.loadClassFromJar(className);

        if (classData) {
            return classData;
        }

        if (!doNotThrow) {
            throw new Error(`Implementation of the ${className} class is not found.`);
        } else if (!this.isJavaAPIClass(className)) {
            return null;
        }
    }

    async loadClassFiles(dirName) {
        try {
            let files = await fs.readdir(dirName);
            this.addPath(dirName);
            for (let file of files) {
                let p = path.normalize(`${dirName}/${file}`);
                if (path.extname(file) === ".class") {
                    await this.loadClassFile(p);
                } else if (file.indexOf(".") == -1) {
                    await this.loadClassFiles(p);
                }
            }
        } catch(ex) {}
    }
    
    async indexJarFiles(dirName) {
        // try {
            let files = await fs.readdir(dirName);
            this.addPath(dirName);
            for (let file of files) {
                let p = path.normalize(`${dirName}/${file}`);
                let stat = await fs.lstat(p);
                if (stat.isFile() && path.extname(file) === ".jar") {
                    await this.indexJarFile(p);
                } else if (stat.isDirectory()) {
                    await this.indexJarFiles(p);
                }
            }
        // } catch(ex) {}
    }

    async loadAllJarFiles(dirName) {
        try {
            let files = await fs.readdir(dirName);
            this.addPath(dirName);
            for (let file of files) {
                let p = path.normalize(`${dirName}/${file}`);
                if (path.extname(file) === ".jar") {
                    await this.loadAllJarClasses(p);
                } else if (file.indexOf(".") == -1) {
                    await this.loadAllJarFiles(p);
                }
            }
        } catch(ex) {}
    }
}

module.exports = ClassLoader;