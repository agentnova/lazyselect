# LazySelect

> The multi-select your `<select multiple>` can't handle. Server-side paginated, searchable, dependency-free. ~4 KB gzipped.

A lightweight multi-select dropdown for the case where you have thousands of options on the backend and need to load them on demand. Drop in one `<script>` tag and go.

- ✅ **Zero dependencies** — no jQuery, no React, no Vue
- ✅ **Server-side pagination** via infinite scroll
- ✅ **Debounced search**
- ✅ **Selections persist across search and pagination** (the part homemade versions usually get wrong)
- ✅ **Bring-your-own backend** via `responseAdapter`
- ✅ **Hidden input sync** for plain HTML form submits — no JS config required
- ✅ **One-line CDN install**, styles included
- ✅ Bootstrap-friendly defaults, fully overridable CSS

---

## Install

### Via CDN (recommended)

```html
<script src="https://cdn.jsdelivr.net/npm/lazyselect@1/lazyselect.min.js"></script>
```

Or unpkg:

```html
<script src="https://unpkg.com/lazyselect@1/lazyselect.min.js"></script>
```

That's it. Styles inject themselves automatically. No CSS file to include.

### Self-hosted

```html
<script src="/static/lazyselect.min.js"></script>
```

### npm

```bash
npm install lazyselect
```

```js
import LazySelect from 'lazyselect';
```

---

## Quick start

```html
<div id="my-filter"></div>

<script src="https://cdn.jsdelivr.net/npm/lazyselect@1/lazyselect.min.js"></script>
<script>
  const ms = new LazySelect('#my-filter', {
    url: '/api/categories',
    placeholder: 'Search categories...',
    onChange: (ids, items) => console.log(ids, items)
  });
</script>
```

Your endpoint should accept `?page=1&pageSize=10&search=foo` and return:

```json
{ "items": [{ "id": 1, "name": "Foo" }, { "id": 2, "name": "Bar" }] }
```

---

## Backend example

```python
# Django
def load_filter_data(request):
    page = int(request.GET.get('page', 1))
    page_size = int(request.GET.get('pageSize', 10))
    search = request.GET.get('search', '')

    qs = MyModel.objects.filter(name__icontains=search)
    start = (page - 1) * page_size
    items = qs[start:start + page_size].values('id', 'name')
    return JsonResponse({'items': list(items)})
```

If your endpoint returns a different shape, use `responseAdapter`:

```js
new LazySelect('#x', {
  url: '/api/users',
  responseAdapter: (raw) => ({
    items: raw.results.map(u => ({ id: u.uuid, name: u.full_name }))
  })
});
```

---

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `url` | string | **required** | Endpoint that returns paginated items. |
| `containerKey` | string | `''` | Sent to the server as `container_data`. Useful when one endpoint serves multiple dropdowns. |
| `pageSize` | number | `10` | Items per request. |
| `searchDebounce` | number | `300` | Milliseconds to wait after typing before searching. |
| `placeholder` | string | `'Search...'` | Input placeholder. |
| `selectedTextFn` | fn(n) | `'N items selected'` | Text shown when items are selected. |
| `noDataText` | string | `'No data available'` | Empty-state message. |
| `loadingText` | string | `'Loading...'` | Loading-state message. |
| `errorText` | string | `'Failed to load'` | Error-state message. |
| `method` | string | `'GET'` | HTTP method. Use `'POST'` to send body as JSON. |
| `extraParams` | object | `{}` | Static params merged into every request. |
| `getExtraParams` | fn() | `null` | Returns dynamic params (e.g. dependent dropdown values). |
| `headers` | object | `{}` | Custom request headers (CSRF, auth, etc). |
| `responseAdapter` | fn(raw) | passthrough | Transform server response into `{items, total}`. |
| `resolveNames` | fn(ids) | `null` | Returns `Promise<[{id,name}]>` to label pre-selected ids. |
| `onChange` | fn(values, items) | `null` | Fires on every selection change. |
| `onReady` | fn(instance) | `null` | Fires after first load. |
| `onError` | fn(error) | `null` | Fires on network/parse errors. |
| `initialValues` | array | `[]` | Pre-select. Pass `[1,2,3]` or `[{id:1,name:'Foo'}]`. |
| `closeOnSelect` | bool | `false` | Close dropdown after each pick. |
| `maxHeight` | string | `'240px'` | Dropdown panel height. |
| `autoInjectStyles` | bool | `true` | Set `false` to use your own CSS. |
| `hiddenInputName` | string | `null` | Auto-create `<input type="hidden" name="...">` synced with selections. |
| `hiddenInputSelector` | string | `null` | Sync to an existing hidden input instead. |
| `hiddenInputJoin` | string | `','` | `','` (CSV), `'json'`, or any separator. |

---

## API methods

```js
ms.getValues();              // ['1', '5', '7']
ms.getSelected();            // [{id:'1', name:'Foo'}, ...]
ms.setValues([1, 2, 3]);     // pre-select by id
ms.setValues([{id:1, name:'Foo'}, ...]);  // or with names (skips resolveNames)
ms.clear();                  // unselect all
ms.reload();                 // reset search and reload
ms.open();
ms.close();
ms.destroy();                // teardown, remove DOM, abort pending requests
```

### Static helpers

```js
// Auto-init by data attributes (no JS config needed)
LazySelect.autoInit();

// Override defaults globally
LazySelect.setDefaults({ pageSize: 25, searchDebounce: 200 });
```

---

## Recipes

### Sync to a hidden input for plain form submission

```html
<form action="/search" method="get">
  <div id="cat" data-ls-url="/api/categories" data-ls-name="categories"></div>
  <button>Search</button>
</form>
<script>LazySelect.autoInit();</script>
```

The form will submit `?categories=1,5,7` automatically — zero JavaScript config.

### Send CSRF tokens (Django, Rails, etc)

```js
new LazySelect('#x', {
  url: '/api/items',
  method: 'POST',
  headers: { 'X-CSRFToken': getCookie('csrftoken') }
});
```

### Pre-select with names already known

```js
new LazySelect('#x', {
  url: '/api/items',
  initialValues: [{id: 5, name: 'Engineering'}, {id: 12, name: 'Sales'}]
});
```

### Pre-select by id only, fetch names lazily

```js
new LazySelect('#x', {
  url: '/api/items',
  initialValues: [5, 12],
  resolveNames: (ids) => fetch('/api/items/lookup?ids=' + ids.join(','))
                            .then(r => r.json())
});
```

### Dependent dropdowns

```js
const country = new LazySelect('#country', {
  url: '/api/countries',
  onChange: () => city.reload()
});
const city = new LazySelect('#city', {
  url: '/api/cities',
  getExtraParams: () => ({ country: country.getValues().join(',') })
});
```

### Auto-init from HTML (no JS config)

```html
<div data-ls-url="/api/categories" data-ls-key="cat"
     data-ls-placeholder="Pick categories" data-ls-name="cat_ids"></div>
<div data-ls-url="/api/users" data-ls-key="usr" data-ls-page-size="20"></div>

<script>LazySelect.autoInit();</script>
```

### Custom styling

Either set `autoInjectStyles: false` and write your own CSS using the same class names, or just override what you need:

```css
.ls-dropdown { border-color: #6610f2; }
.ls-item:hover { background: #e7f1ff; }
.ls-search:focus { border-color: #6610f2; box-shadow: 0 0 0 .2rem rgba(102,16,242,.15); }
```

CSS class names: `.ls-container`, `.ls-search`, `.ls-dropdown`, `.ls-items`, `.ls-item`, `.ls-loading`, `.ls-empty`, `.ls-error`.

---

## Browser support

Modern evergreen browsers. Uses `fetch`, `Promise`, `AbortController`, `Object.assign`, and `dataset` — IE11 is not supported.

## Size

| File | Size |
|---|---|
| `lazyselect.js` | ~18 KB |
| `lazyselect.min.js` | ~11 KB |
| Minified + gzipped | **~3.7 KB** |

## License

MIT
