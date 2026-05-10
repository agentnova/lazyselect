/*!
 * LazySelect v1.0.0
 * Lightweight, dependency-free multi-select dropdown with
 * server-side pagination, search, and selection persistence.
 *
 * License: MIT
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) define([], factory);
    else if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.LazySelect = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var STYLES =
        '.ls-container{position:relative;width:100%;box-sizing:border-box}' +
        '.ls-container *,.ls-container *::before,.ls-container *::after{box-sizing:border-box}' +
        '.ls-search{width:100%;padding:.375rem .75rem;font-size:1rem;line-height:1.5;color:#212529;' +
            'background-color:#fff;border:1px solid #ced4da;border-radius:.375rem;cursor:pointer;outline:none}' +
        '.ls-search:focus{border-color:#86b7fe;box-shadow:0 0 0 .2rem rgba(13,110,253,.15)}' +
        '.ls-dropdown{position:absolute;top:calc(100% + 2px);left:0;right:0;z-index:1050;' +
            'background:#fff;border:1px solid #ced4da;border-radius:.375rem;' +
            'box-shadow:0 4px 12px rgba(0,0,0,.08);overflow-y:auto;overflow-x:hidden}' +
        '.ls-items{padding:4px 0}' +
        '.ls-item{display:flex;align-items:center;gap:8px;padding:6px 12px;margin:0;' +
            'cursor:pointer;user-select:none;font-weight:400;font-size:.9rem;color:#212529}' +
        '.ls-item:hover{background:#f1f3f5}' +
        '.ls-item input[type="checkbox"]{margin:0;flex-shrink:0;cursor:pointer}' +
        '.ls-item span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
        '.ls-loading,.ls-empty,.ls-error{padding:10px 12px;text-align:center;' +
            'color:#6c757d;font-size:.875rem}' +
        '.ls-error{color:#dc3545}';

    var _stylesInjected = false;
    function injectStyles() {
        if (_stylesInjected || typeof document === 'undefined') return;
        if (document.getElementById('ls-styles')) { _stylesInjected = true; return; }
        var s = document.createElement('style');
        s.id = 'ls-styles';
        s.textContent = STYLES;
        document.head.appendChild(s);
        _stylesInjected = true;
    }

    function debounce(fn, delay) {
        var t;
        return function () {
            var ctx = this, args = arguments;
            clearTimeout(t);
            t = setTimeout(function () { fn.apply(ctx, args); }, delay);
        };
    }

    function buildQuery(params) {
        var pairs = [];
        Object.keys(params).forEach(function (k) {
            var v = params[k];
            if (v === undefined || v === null) return;
            pairs.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
        });
        return pairs.join('&');
    }

    function assign(target) {
        for (var i = 1; i < arguments.length; i++) {
            var s = arguments[i];
            if (!s) continue;
            for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) target[k] = s[k];
        }
        return target;
    }

    var _uid = 0;

    var DEFAULTS = {
        url: '',
        containerKey: '',
        pageSize: 10,
        searchDebounce: 300,
        placeholder: 'Search...',
        selectedTextFn: function (n) { return n + ' item' + (n === 1 ? '' : 's') + ' selected'; },
        noDataText: 'No data available',
        loadingText: 'Loading...',
        errorText: 'Failed to load',
        method: 'GET',
        extraParams: {},
        getExtraParams: null,
        headers: {},
        responseAdapter: function (raw) {
            return { items: (raw && raw.items) || [], total: raw && raw.total };
        },
        resolveNames: null,
        onChange: null,
        onReady: null,
        onError: null,
        initialValues: [],
        closeOnSelect: false,
        maxHeight: '240px',
        autoInjectStyles: true,
        hiddenInputName: null,
        hiddenInputSelector: null,
        hiddenInputJoin: ','
    };

    function LazySelect(target, options) {
        if (!(this instanceof LazySelect)) return new LazySelect(target, options);

        this.el = typeof target === 'string' ? document.querySelector(target) : target;
        if (!this.el) throw new Error('LazySelect: target not found');

        this.opts = assign({}, DEFAULTS, options || {});
        if (!this.opts.url) throw new Error('LazySelect: `url` is required');

        if (this.opts.autoInjectStyles) injectStyles();

        this._page = 1;
        this._search = '';
        this._loading = false;
        this._allLoaded = false;
        this._selectedMap = Object.create(null);
        this._uid = ++_uid;
        this._abort = null;
        this._destroyed = false;

        this._build();
        this._bind();
        this._initSelections();
        this._loadItems(false);

        if (typeof this.opts.onReady === 'function') this.opts.onReady(this);
    }

    LazySelect.prototype._build = function () {
        var el = this.el;
        el.classList.add('ls-container');
        el.innerHTML = '';

        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.className = 'ls-search';
        this.input.placeholder = this.opts.placeholder;
        this.input.readOnly = true;
        this.input.autocomplete = 'off';

        this.dropdown = document.createElement('div');
        this.dropdown.className = 'ls-dropdown';
        this.dropdown.style.display = 'none';
        this.dropdown.style.maxHeight = this.opts.maxHeight;

        this.itemsEl = document.createElement('div');
        this.itemsEl.className = 'ls-items';

        this.loadingEl = document.createElement('div');
        this.loadingEl.className = 'ls-loading';
        this.loadingEl.textContent = this.opts.loadingText;
        this.loadingEl.style.display = 'none';

        this.dropdown.appendChild(this.itemsEl);
        this.dropdown.appendChild(this.loadingEl);
        el.appendChild(this.input);
        el.appendChild(this.dropdown);

        if (this.opts.hiddenInputSelector) {
            this.hidden = document.querySelector(this.opts.hiddenInputSelector);
        } else if (this.opts.hiddenInputName) {
            this.hidden = document.createElement('input');
            this.hidden.type = 'hidden';
            this.hidden.name = this.opts.hiddenInputName;
            el.appendChild(this.hidden);
        }
    };

    LazySelect.prototype._bind = function () {
        var self = this;

        this._onFocus = function () {
            if (self._destroyed) return;
            self.input.readOnly = false;
            if (self._search) self.input.value = self._search;
            self.dropdown.style.display = 'block';
        };

        this._onDocDown = function (e) {
            if (self._destroyed) return;
            if (self.el.contains(e.target)) return;
            self._closeDropdown();
        };

        this._onScroll = function () {
            if (self._loading || self._allLoaded) return;
            var d = self.dropdown;
            if (d.scrollTop + d.clientHeight >= d.scrollHeight - 4) {
                self._page++;
                self._loadItems(true);
            }
        };

        this._onInput = debounce(function (e) {
            if (self._destroyed) return;
            self._search = e.target.value;
            self._page = 1;
            self._allLoaded = false;
            self.itemsEl.innerHTML = '';
            self._loadItems(false);
        }, this.opts.searchDebounce);

        this._onItemsClick = function (e) {
            var t = e.target;
            if (t.tagName === 'INPUT' && t.type === 'checkbox') {
                var id = t.dataset.id;
                var name = t.dataset.name;
                if (t.checked) self._selectedMap[id] = name;
                else delete self._selectedMap[id];
                self._refreshPlaceholder();
                self._syncHidden();
                self._emitChange();
                if (self.opts.closeOnSelect) self._closeDropdown();
            }
        };

        this.input.addEventListener('focus', this._onFocus);
        document.addEventListener('mousedown', this._onDocDown);
        document.addEventListener('touchstart', this._onDocDown, { passive: true });
        this.dropdown.addEventListener('scroll', this._onScroll);
        this.input.addEventListener('input', this._onInput);
        this.itemsEl.addEventListener('click', this._onItemsClick);
    };

    LazySelect.prototype._initSelections = function () {
        var self = this;
        var iv = this.opts.initialValues || [];
        if (!iv.length) return;

        var idsNeedingNames = [];
        iv.forEach(function (v) {
            if (v && typeof v === 'object') self._selectedMap[v.id] = String(v.name);
            else { self._selectedMap[v] = String(v); idsNeedingNames.push(v); }
        });
        this._refreshPlaceholder();
        this._syncHidden();

        if (idsNeedingNames.length && typeof this.opts.resolveNames === 'function') {
            Promise.resolve(this.opts.resolveNames(idsNeedingNames)).then(function (resolved) {
                if (self._destroyed || !resolved) return;
                resolved.forEach(function (item) {
                    if (item.id in self._selectedMap) self._selectedMap[item.id] = String(item.name);
                });
                self._refreshPlaceholder();
            });
        }
    };

    LazySelect.prototype._closeDropdown = function () {
        this.dropdown.style.display = 'none';
        this.input.value = '';
        this.input.readOnly = true;
        this._refreshPlaceholder();
    };

    LazySelect.prototype._refreshPlaceholder = function () {
        var n = Object.keys(this._selectedMap).length;
        this.input.placeholder = n > 0 ? this.opts.selectedTextFn(n) : this.opts.placeholder;
    };

    LazySelect.prototype._syncHidden = function () {
        if (!this.hidden) return;
        var values = this.getValues();
        this.hidden.value = this.opts.hiddenInputJoin === 'json'
            ? JSON.stringify(values)
            : values.join(this.opts.hiddenInputJoin);
    };

    LazySelect.prototype._emitChange = function () {
        if (typeof this.opts.onChange === 'function') {
            this.opts.onChange(this.getValues(), this.getSelected());
        }
    };

    LazySelect.prototype._loadItems = function (append) {
        var self = this;
        if (this._abort && typeof this._abort.abort === 'function') this._abort.abort();
        this._abort = (typeof AbortController !== 'undefined') ? new AbortController() : null;

        this._loading = true;
        this.loadingEl.style.display = 'block';

        var params = {
            page: this._page,
            pageSize: this.opts.pageSize,
            search: this._search,
            container_data: this.opts.containerKey
        };
        assign(params, this.opts.extraParams || {});
        if (typeof this.opts.getExtraParams === 'function') {
            assign(params, this.opts.getExtraParams() || {});
        }

        var url = this.opts.url;
        var fetchOpts = {
            method: this.opts.method,
            headers: assign({ 'Accept': 'application/json' }, this.opts.headers),
            signal: this._abort ? this._abort.signal : undefined
        };

        if (this.opts.method === 'GET') {
            url += (url.indexOf('?') === -1 ? '?' : '&') + buildQuery(params);
        } else {
            fetchOpts.headers['Content-Type'] = 'application/json';
            fetchOpts.body = JSON.stringify(params);
        }

        fetch(url, fetchOpts)
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (raw) {
                if (self._destroyed) return;
                var data = self.opts.responseAdapter(raw) || { items: [] };
                self._renderItems(data.items, append);
                if (!data.items || data.items.length < self.opts.pageSize) self._allLoaded = true;
            })
            .catch(function (err) {
                if (err && err.name === 'AbortError') return;
                if (self._destroyed) return;
                if (!append) {
                    self.itemsEl.textContent = '';
                    var errEl = document.createElement('div');
                    errEl.className = 'ls-error';
                    errEl.textContent = self.opts.errorText;
                    self.itemsEl.appendChild(errEl);
                }
                if (typeof self.opts.onError === 'function') self.opts.onError(err);
            })
            .then(function () {
                if (self._destroyed) return;
                self._loading = false;
                self.loadingEl.style.display = 'none';
            });
    };

    LazySelect.prototype._renderItems = function (items, append) {
        if (!append) this.itemsEl.innerHTML = '';

        if ((!items || !items.length) && !append && Object.keys(this._selectedMap).length === 0) {
            var empty = document.createElement('div');
            empty.className = 'ls-empty';
            empty.textContent = this.opts.noDataText;
            this.itemsEl.appendChild(empty);
            return;
        }

        var frag = document.createDocumentFragment();
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (it.id in this._selectedMap) this._selectedMap[it.id] = String(it.name);

            var row = document.createElement('label');
            row.className = 'ls-item';
            row.htmlFor = 'ls-' + this._uid + '-' + it.id;

            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.id = 'ls-' + this._uid + '-' + it.id;
            cb.value = String(it.id);
            cb.dataset.id = String(it.id);
            cb.dataset.name = String(it.name);
            cb.checked = (it.id in this._selectedMap);

            var span = document.createElement('span');
            span.textContent = it.name;

            row.appendChild(cb);
            row.appendChild(span);
            frag.appendChild(row);
        }
        this.itemsEl.appendChild(frag);
    };

    LazySelect.prototype.getValues = function () {
        return Object.keys(this._selectedMap);
    };

    LazySelect.prototype.getSelected = function () {
        var out = [];
        for (var id in this._selectedMap) out.push({ id: id, name: this._selectedMap[id] });
        return out;
    };

    LazySelect.prototype.setValues = function (idsOrItems) {
        this._selectedMap = Object.create(null);
        var arr = idsOrItems || [];
        for (var i = 0; i < arr.length; i++) {
            var v = arr[i];
            if (v && typeof v === 'object') this._selectedMap[v.id] = String(v.name);
            else this._selectedMap[v] = String(v);
        }
        var cbs = this.itemsEl.querySelectorAll('input[type="checkbox"]');
        for (var j = 0; j < cbs.length; j++) cbs[j].checked = (cbs[j].dataset.id in this._selectedMap);
        this._refreshPlaceholder();
        this._syncHidden();
        this._emitChange();
    };

    LazySelect.prototype.clear = function () {
        this._selectedMap = Object.create(null);
        var cbs = this.itemsEl.querySelectorAll('input[type="checkbox"]');
        for (var i = 0; i < cbs.length; i++) cbs[i].checked = false;
        this._refreshPlaceholder();
        this._syncHidden();
        this._emitChange();
    };

    LazySelect.prototype.reload = function () {
        this._page = 1;
        this._allLoaded = false;
        this._search = '';
        this.input.value = '';
        this.itemsEl.innerHTML = '';
        this._loadItems(false);
    };

    LazySelect.prototype.open = function () { this._onFocus(); };
    LazySelect.prototype.close = function () { this._closeDropdown(); };

    LazySelect.prototype.destroy = function () {
        this._destroyed = true;
        if (this._abort && typeof this._abort.abort === 'function') this._abort.abort();
        this.input.removeEventListener('focus', this._onFocus);
        document.removeEventListener('mousedown', this._onDocDown);
        document.removeEventListener('touchstart', this._onDocDown);
        this.dropdown.removeEventListener('scroll', this._onScroll);
        this.input.removeEventListener('input', this._onInput);
        this.itemsEl.removeEventListener('click', this._onItemsClick);
        this.el.classList.remove('ls-container');
        this.el.innerHTML = '';
    };

    LazySelect.autoInit = function (selector, sharedOptions) {
        var nodes = document.querySelectorAll(selector || '[data-ls-url]');
        var instances = [];
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            var opts = assign({}, sharedOptions || {}, {
                url: n.dataset.lsUrl,
                containerKey: n.dataset.lsKey || n.id || '',
                pageSize: parseInt(n.dataset.lsPageSize, 10) || undefined,
                placeholder: n.dataset.lsPlaceholder || undefined,
                hiddenInputName: n.dataset.lsName || undefined
            });
            Object.keys(opts).forEach(function (k) { if (opts[k] === undefined) delete opts[k]; });
            instances.push(new LazySelect(n, opts));
        }
        return instances;
    };

    LazySelect.setDefaults = function (overrides) {
        assign(DEFAULTS, overrides || {});
    };

    LazySelect.version = '1.0.0';
    return LazySelect;
}));
