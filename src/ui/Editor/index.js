/*!
 * 新版 markdown 编辑器
 * @author ydr.me
 * @create 2015-04-03 02:32:10
 */


define(function (require, exports, module) {
    'use strict';

    /**
     * @module ui/Editor/
     * @requires 3rd/codemirror/mode/gfm
     * @requires 3rd/codemirror/addon/display/fullscreen
     * @requires 3rd/codemirror/addon/display/placeholder
     * @requires ui/
     * @requires ui/Msg/
     * @requires ui/Dialog/
     * @requires code/dom/selector
     * @requires code/dom/attribute
     * @requires code/dom/modification
     * @requires code/event/base
     * @requires utils/controller
     * @requires utils/date
     * @requires utils/dato
     * @requires utils/typeis
     * @requires libs/Template
     */

    var CodeMirror = require('../../3rd/codemirror/mode/gfm.js');
    require('../../3rd/codemirror/addon/display/fullscreen.js');
    require('../../3rd/codemirror/addon/display/placeholder.js');
    //require('../../3rd/codemirror/addon/selection/active-line.js');
    var ui = require('../');
    var Msg = require('../Msg/');
    var Dialog = require('../Dialog/');
    var selector = require('../../core/dom/selector.js');
    var attribute = require('../../core/dom/attribute.js');
    var modification = require('../../core/dom/modification.js');
    var event = require('../../core/event/base.js');
    var controller = require('../../utils/controller.js');
    var date = require('../../utils/date.js');
    var dato = require('../../utils/dato.js');
    var typeis = require('../../utils/typeis.js');
    var Template = require('../../libs/Template.js');
    var template = require('html!./template.html');
    var tpl = new Template(template);
    var style = require('css!./style.css');
    //var alienClass = 'alien-ui-editor';
    var RE_IMG_TYPE = /^image\//;
    //var alienIndex = 0;
    var localStorage = window.localStorage;
    var pathname = location.pathname;
    var defaults = {
        // 手动设置 ID
        id: '',
        addClass: '',
        // tab 长度
        tabSize: 4,
        // 是否允许备份
        canBackup: true,
        // 最小检查同步本地的内容的相差长度
        checkLength: 3,
        autoFocus: true,
        minHeight: 200,
        // 上传操作
        // uploadCallback 约定：
        // arg0: err 对象
        // arg1: 进度回调
        // arg2: list 上传成功JSON数组对象
        // [{url:'1.jpg',width:100,height:100}]
        uploadCallback: null
    };
    var Editor = ui.create(function ($ele, options) {
        var the = this;

        the._$ele = selector.query($ele)[0];
        the._options = dato.extend({}, defaults, options);
        the._calStoreId();
        the._editor = CodeMirror.fromTextArea(the._$ele, {
            mode: 'gfm',
            lineNumbers: false,
            theme: "fed",
            autoCloseBrackets: true,
            autoCloseTags: true,
            dragDrop: false,
            foldGutter: false,
            indentWithTabs: true,
            lineWrapping: true,
            matchBrackets: true,
            readOnly: false,
            showTrailingSpace: true,
            styleActiveLine: true,
            styleSelectedText: true,
            autofocus: the._options.autoFocus,
            tabSize: the._options.tabSize,
            extraKeys: {
                'F11': function (cm) {
                    cm.setOption("fullScreen", !cm.getOption("fullScreen"));
                },
                'Esc': function (cm) {
                    if (cm.getOption("fullScreen")) {
                        cm.setOption("fullScreen", false);
                    }
                }
            }
        });

        the._$wrapper = the._editor.getWrapperElement();
        attribute.addClass(the._$wrapper, the._options.addClass);
        attribute.css(the._$wrapper, 'min-height', the._options.minHeight);
        the._initEvent();

        if (the._options.canBackup) {
            controller.nextTick(the._initValue, the);
        }
    });


    /**
     * 设置编辑器内容
     * @param value {String} 设置内容
     * @returns {Editor}
     */
    Editor.fn.setValue = function (value) {
        this._editor.setValue(value);

        return this;
    };


    /**
     * 初始化内容
     * @private
     */
    Editor.fn._initValue = function () {
        var the = this;
        var local = the._getLocal();
        var minTime = 24 * 60 * 60 * 1000;
        var deltaTime = Date.now() - local.ver;
        var humanTime = date.from(local.ver);
        var nowVal = the._$ele.value;
        var nowLen = nowVal.length;
        var storeVal = local.val;
        var storeLen = storeVal.length;

        // 1天之内的本地记录 && 内容部分不一致
        if (deltaTime < minTime && Math.abs(nowLen - storeLen) >= the._options.checkLength) {
            new Msg({
                content: '本地缓存内容与当前不一致。' +
                '<br>缓存时间为：<b>' + humanTime + '</b>。' +
                '<br>本地缓存内容长度为：<b>' + storeLen + '</b>。' +
                '<br>当前内容长度为：<b>' + nowLen + '</b>。' +
                '<br>是否恢复？',
                buttons: ['确定', '取消']
            })
                .on('close', function (index) {
                    if (index === 0) {
                        the.setValue(storeVal);
                        the._$ele.value = storeVal;

                        controller.nextTick(function () {
                            try {
                                the._editor.setCursor(local.cur);
                            } catch (err) {
                                // ignore
                            }

                            if (the._options.autoFocus) {
                                the._editor.focus();
                            }
                        });
                        /**
                         * 编辑器内容变化之后
                         * @event change
                         * @param value {String} 变化之后的内容
                         */
                        the.emit('change', storeVal);
                    } else {
                        the._saveLocal();
                    }
                });
        }
    };


    /**
     * 计算备份ID
     * @private
     */
    Editor.fn._calStoreId = function () {
        var the = this;

        if (the._options.id) {
            the._storeId = the._options.id;
            return;
        }

        var $ele = the._$ele;
        var atts = $ele.attributes;
        var attrList = [];
        var id = $ele.id;

        the._storeId = 'alien-ui-editor';

        if (id) {
            the._storeId += pathname + '#' + id;
        } else {
            dato.each(atts, function (i, attr) {
                attrList.push(attr.name + '=' + attr.value);
            });

            the._storeId += pathname +
            '<' + the._$ele.tagName + '>.' +
            the._$ele.className +
            '[' + attrList.join(';') + ']';
        }
    };


    /**
     * 读取本地备份
     * @private
     */
    Editor.fn._getLocal = function () {
        var the = this;
        var local = localStorage.getItem(the._storeId);
        var ret;

        try {
            ret = JSON.parse(local);
        } catch (err) {
            // ignore
        }

        return ret || {ver: 0, val: ''};
    };

    /**
     * 写入本地备份
     * @private
     */
    Editor.fn._saveLocal = function () {
        var the = this;

        try {
            localStorage.setItem(the._storeId, JSON.stringify({
                val: the._$ele.value,
                ver: Date.now(),
                cur: the._editor.getCursor()
            }));
        } catch (err) {
            // ignore
        }
    };


    /**
     * 清除本地备份记录
     */
    Editor.fn.clearStore = function () {
        var the = this;

        window.localStorage.setItem(the._storeId, '');

        return the;
    };


    /**
     * 替换当前选中的文本，如果没有选中，则插入
     * @param value {String} 替换文本
     */
    Editor.fn.replace = function (value) {
        var the = this;

        the._editor.focus();
        the._editor.replaceSelection(value);

        return the;
    };


    /**
     * 包裹当前选中的文本
     * @param value {String} 包裹文本
     */
    Editor.fn.wrap = function (value) {
        var the = this;

        the._editor.focus();

        var cursor = the._editor.getCursor();
        var raw = the._editor.getSelection();

        the._editor.replaceSelection(value + raw + value);

        if (!raw) {
            the._editor.setCursor(cursor.line, cursor.ch + value.length);
        }

        return the;
    };


    /**
     * 事件初始化
     * @private
     */
    Editor.fn._initEvent = function () {
        var the = this;

        // `code`
        the._addKeyMap('`', function () {
            var raw = the._editor.getSelection();

            if (raw) {
                the.wrap('`');
            } else {
                the.replace('`');
            }
        }, false);


        // **blod**
        the._addKeyMap('B', function () {
            the.wrap('__');
        });


        // *italic*
        the._addKeyMap('I', function () {
            the.wrap('_');
        });


        // change
        the._editor.on('change', function () {
            the._$ele.value = the._editor.getValue();
            /**
             * 编辑器内容变化之后
             * @event change
             * @param value {String} 变化之后的内容
             */
            the.emit('change', the._$ele.value);
            the._saveLocal();
        });


        // cursor
        the._editor.on('cursorActivity', the._saveLocal.bind(the));


        // 修改设置时
        the.on('setoptions', function (options) {
            if (the._storeId !== options.id) {
                the._storeId = options.id;
            }
        });

        event.on(the._$wrapper, 'drop', the._ondrop.bind(the));
        event.on(the._$wrapper, 'paste', the._onpaste.bind(the));
        event.on(the._$wrapper, 'click', the._onclick.bind(the));
    };


    /**
     * 拖拽回调
     * @private
     */
    Editor.fn._ondrop = function (eve) {
        this._parseImgList(eve, eve.dataTransfer && eve.dataTransfer.items);
    };


    /**
     * 粘贴回调
     * @param eve
     * @private
     */
    Editor.fn._onpaste = function (eve) {
        this._parseImgList(eve, eve.clipboardData && eve.clipboardData.items);
    };


    /**
     * 单击编辑器
     * @private
     */
    Editor.fn._onclick = function () {
        var the = this;

        if (!the._editor.hasFocus()) {
            the._editor.focus();
        }
    };

    /**
     * 解析拖拽、粘贴里的图片信息
     * @param items
     * @private
     */
    Editor.fn._parseImgList = function (eve, items) {
        var the = this;

        the._uploadList = [];
        dato.each(items, function (index, item) {
            var file;

            if (RE_IMG_TYPE.test(item.type) && item.kind === 'file') {
                file = item.getAsFile();

                if (file && file.size > 0) {
                    the._uploadList.push({
                        url: window.URL.createObjectURL(item.getAsFile()),
                        file: item.getAsFile()
                    });
                }
            }
        });

        if (the._uploadList.length) {
            eve.preventDefault();
            the._uploadDialog();
        } else if (eve.dataTransfer && eve.dataTransfer.files && eve.dataTransfer.files.length ||
            eve.clipboardData && eve.clipboardData.files && eve.clipboardData.files.length) {
            eve.preventDefault();
            return new Msg({
                content: '请拖拽或粘贴图片文件',
                buttons: ['确定']
            });
        }
    };


    /**
     * 上传对话框
     * @private
     */
    Editor.fn._uploadDialog = function () {
        var the = this;
        var dt = {
            id: the._id,
            uploads: the._uploadList
        };
        var $dialog;
        var options = the._options;

        if (typeis(options.uploadCallback) !== 'function') {
            return new Msg({
                content: '尚未配置上传回调'
            });
        }

        if (the._dialog) {
            the._dialog.destroy();
            modification.remove(the._$dialog);
            the._dialog = null;
        }

        $dialog = modification.parse(tpl.render(dt))[0];
        modification.insert($dialog, document.body, 'beforeend');
        the._$dialog = $dialog;
        the._dialog = new Dialog($dialog, {
            title: '上传' + the._uploadList.length + '张图片（0%）',
            hideClose: true
        }).open();
        the._doUpload();
    };


    /**
     * 上传
     * @private
     */
    Editor.fn._doUpload = function () {
        var the = this;
        var dialog = the._dialog;
        var list = the._uploadList;
        var onprogress = function (percent) {
            dialog.setTitle('上传' + list.length + '张图片（' + percent + '）');
        };
        var ondone = function (err, list) {
            var html = [];
            var msg;

            if (err) {
                msg = new Msg({
                    content: err.message
                });
                msg.on('close', function () {
                    the.uploadDestroy();
                });
                return;
            }

            dato.each(list, function (index, img) {
                // 预加载
                var _img = new Image();

                _img.src = img.url;
                html.push('\n![' + img.name + '](' + img.url + ')\n');
            });

            the.replace(html.join(''));
            the.uploadDestroy();
        };

        the._options.uploadCallback.call(the, list, onprogress, ondone);
    };


    /**
     * 销毁上传实例
     * @private
     */
    Editor.fn.uploadDestroy = function () {
        var the = this;

        the._dialog.destroy(function () {
            modification.remove(the._$dialog);
            the._editor.focus();
        });
    };


    /**
     * 添加事件回调
     * @param key
     * @param callback
     * @param [isCtrl=true]
     * @private
     */
    Editor.fn._addKeyMap = function (key, callback, isCtrl) {
        var the = this;
        var isMac = CodeMirror.keyMap.default === CodeMirror.keyMap.macDefault;
        var ctrl = isMac ? 'Cmd-' : 'Ctrl-';
        var map = {};

        if (isCtrl === false) {
            map[key] = callback;
        } else {
            map[ctrl + key] = callback;
        }

        the._editor.addKeyMap(map);
    };


    /**
     * 获取内容
     * @returns {*}
     */
    Editor.fn.getValue = function () {
        return this._editor.getValue();
    };


    /**
     * 销毁实例
     */
    Editor.fn.destroy = function () {
        var the = this;

        event.un(the._$wrapper, 'input', the._oninput);
        event.un(the._$wrapper, 'drop', the._ondrop);
        event.un(the._$wrapper, 'paste', the._onpaste);
        this._editor.toTextArea();
    };


    modification.importStyle(style);
    module.exports = Editor;
});
