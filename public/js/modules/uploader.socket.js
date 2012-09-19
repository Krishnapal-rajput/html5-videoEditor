/**.
 * User: Matthieu Holzer
 * Date: 09.09.12
 * Time: 14:21
 */
define(["config", "jquery", "underscore"], function (Config, $, _) {

    var uploader = function (socket) {

        var self = this,
            socket = socket,
            fileQueue = [],
            fileReader = null,
            isUploading = false,
            blob = null;

        this.addFile = function (assetId, file, projectId, byteOffset) {

            byteOffset = byteOffset || 0;

            //check to see if file isn't already in queue
            if (fileQueue.length > 0) {
                for (var i = 0; i < fileQueue.length; i++) {
                    if (fileQueue[i].name === file.name) {
                        return;
                    }
                }
            }

            file.assetId = assetId;
            file.projectId = projectId;
            file.byteOffset = byteOffset;

            fileQueue.push(file);
        };

        this.removeFile = function (file) {
            if (currentFile === file) {
                //this.abort();
                fileQueue.shift();
            }
        };

        this.sendFileChunk = function (file, blob) {

            isUploading = true;

            socket.emit("upload", {
                "assetId"    : file.assetId,
                "fileName"   : file.name,
                "byteOffset" : file.byteOffset,
                "bytesTotal" : file.size,
                "bytes"      : blob,
                "projectId"  : file.projectId
            });

        };

        this.processFile = function (file) {

            var start = file.byteOffset,
                end = file.byteOffset + Config.UPLOADER_SOCKET_CHUNK_SIZE;

            //change asset-status
            app.project.get('library').get(file.assetId).set('status', 'Uploading');

            fileReader = new FileReader();

            if (file.byteOffset + Config.UPLOADER_SOCKET_CHUNK_SIZE > file.size) {
                end = file.size;
            }

            blob = (file.slice || file.webkitSlice || file.mozSlice).call(file, start, end);

            fileReader.onloadend = function (event) {
                if (event.target.readyState == FileReader.DONE) {

                    //regex to get rid of the data;base stuff
                    self.sendFileChunk(file, event.target.result.match(/,(.*)$/)[1]);
                    fileReader = null;
                }
            };

            fileReader.readAsDataURL(blob);

        };

        this.onResponse = function (res) {

            var file = self.getFileByName(res.fileName),
                isComplete = false;

            blob = null;
            fileReader = null;
            file.byteOffset = res.byteOffset;

            if (res.isComplete) {
                isComplete = true;
                fileQueue.shift();

                $(self).trigger("complete", {
                    "fileName" : file.name,
                    "assetId"  : file.assetId
                });

                if (fileQueue.length > 0) {
                    self.processFile(fileQueue[0]);
                }
                else {
                    isUploading = false;
                }
            }

            else if (!isComplete) {
                if (res.status === "success") {
                    $(self).trigger("progress", {
                        "fileName"         : file.name,
                        "assetId"          : file.assetId,
                        "progressRelative" : Math.round(file.byteOffset / file.size * 100 * Math.pow(10, 2)) / Math.pow(10, 2),
                        "progressBytes"    : file.byteOffset
                    });
                    self.processFile(file);
                }

            }

        };

        this.start = function () {

            if (fileQueue.length > 0 && !isUploading) {
                console.log("UPLOADER.JS :: START");
                this.processFile(fileQueue[0]);
            }
        };

        this.stop = function () {
            if (!isUploading)  return;
            if (fileReader) fileReader.abort();
            isUploading = false;
        };

        this.getFileByName = function (fileName) {
            for (var i = 0; i < fileQueue.length; i++) {
                if (fileQueue[i].name === fileName) return fileQueue[i];
            }
        };

        this.createLocalFileUrl = function (file) {
            return (window.webkitURL || window.URL).createObjectURL(file);

        };

        this.revokeLocalFileUrl = function (url) {
            //TODO use this when file gets removed from lib
            return (window.webkitURL || window.URL).revokeObjectURL(url);
        };

        this.getCleanFileName = function (fileName) {
            if (/(.+?)(\.[^.]*$|$)/.test(fileName)) {
                return $.trim(/(.+?)(\.[^.]*$|$)/.exec(fileName)[1].substr(0, Config.GUI_MAX_FILENAME_LENGTH));
            }
            return null;
        };

        this.getFileExtension = function (fileName) {
            var regEx = /\.([^\.]+)$/;
            return ext = regEx.test(fileName) ? regEx.exec(fileName)[1].toString() : null;
        }

        this.getAssetTypeByExtension = function (ext) {
            if (_.include(Config.UPLOADER_SUPPORTED_VIDEO_TYPES, ext)) return "video";
            else if (_.include(Config.UPLOADER_SUPPORTED_AUDIO_TYPES, ext)) return "audio";
            else if (_.include(Config.UPLOADER_SUPPORTED_IMAGE_TYPES, ext)) return "image";

            return null;
        };

        this.getAssetTypeByFile = function (file) {
            var mimeReg = /video|image|audio/,
                extReg = /\.([^\.]+)$/,
                mime = mimeReg.test(file.type) ? mimeReg.exec(file.type)[0].toString() : null,
                ext = extReg.test(file.name) ? extReg.exec(file.name)[1].toString() : null;

            if (!mime && !ext) return null;
            else if (mime) return mime;
            else return self.getAssetTypeByExtension(ext);

        };

        socket.on("upload:progress", this.onResponse);
    }
    return uploader;
});