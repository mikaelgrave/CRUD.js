/* jshint -W024 */

(function( exports ) {
  'use strict';

  // Constructor
  var Database = function ( conf ) {
    this.conf = exports.extend({
      name: 'database',
      indexedKeys: [],
      uniqueKey: 'id',
      driver: new Database.drivers.StorageDriver({
        name: conf.name,
        storage: exports.localStorage
      })
    }, conf || {});

    this.initialize();
  };

  // [PRIVATE]
  // Initialize
  Database.prototype.initialize = function () {
    this.data = this.load() || [];
    this.id = 0;
    if (this.data.length > 0) {
      this.data = this.data.map(function(e) { return parseInt(e, 10); });
      this.id = Math.max.apply(Math, this.data);
    }
  };

  // Find entry
  // Returns [array]
  Database.prototype.find = function ( obj ) {
    if (typeof obj === 'undefined') {
      return this.findAll();
    }

    var item, entry, okay,
        data = [],
        filtered = [],
        unindexedKeys = [];
    // Dealing with indexed keys
    for (var property in obj) {
      if (this.conf.indexedKeys.indexOf(property) !== -1) {
        item = this.conf.driver.getItem(property + ':' + obj[property]);
        filtered.push(item !== null ? item : false);
      } else {
        unindexedKeys.push(property);
      }
    }

    // Dealing with unindexed keys
    var collection = filtered.length === 0 ? this.data : filtered.length > 1 ? intersect.apply(this, collection) : filtered[0];
    for (var i = 0; i < collection.length; i++) {
      entry = this.conf.driver.getItem(collection[i]);
      okay = true;
      for (var j = 0; j < unindexedKeys.length; j++) {
        if (entry[unindexedKeys] !== obj[unindexedKeys]) {
          okay = false;
          break;
        }
      }

      if(okay) {
        data.push(entry);
      }
    }

    return data;
  };

  // Find all entries
  // Returns [array]
  Database.prototype.findAll = function () {
    var data = [];
    for (var i = 0, len = this.data.length; i < len; i++) {
      data.push(this.conf.driver.getItem(this.data[i]));
    }
    return data;
  };

  // Insert entry
  // Returns [int] | undefined
  Database.prototype.insert = function ( obj ) {
    if(Object.prototype.toString.call(obj) !== '[object Object]') {
      throw 'Can\'t insert ' + obj + '. Please insert object.';
    }
    this.id++;
    if (this.data.indexOf(this.id) === -1) {
      obj[this.conf.uniqueKey] = this.id;
      this.data.push(this.id);
      this.conf.driver.setItem(this.id, obj);
      this.conf.driver.setItem('__data', this.data.join(','));
      this.buildIndex(this.id, obj);
      return this.id;
    }
  };

  // Update entry by search / id
  // Returns [object] | undefined
  Database.prototype.update = function ( id, obj ) {
    if (this.data.indexOf(id) !== -1) {
      this.destroyIndex(id); // First destroy existing index for object
      this.conf.driver.setItem(id, obj); // Override object
      this.buildIndex(id, obj); // Rebuild index
      return obj;
    }
  };

  // Delete entry by search / id
  // Returns [boolean]
  Database.prototype.delete = function ( arg ) {
    // If passing an object, search and destroy
    if (Object.prototype.toString.call(arg) === '[object Object]') {
      this.findAndDelete(arg);
    // If passing an id, destroy id
    } else {
      if (this.data.indexOf(arg) !== -1) {
        this.data.splice(this.data.indexOf(arg), 1);
        this.destroyIndex(arg);
        this.conf.driver.removeItem(arg);
        this.conf.driver.setItem('__data', this.data.join(','));
        return this.data.indexOf(arg) === -1;
      }
    }
  };

  // [PRIVATE]
  // Search then destroy
  Database.prototype.findAndDelete = function ( obj ) {
    var id, entries = this.find(obj);
    for(var i = 0; i < entries.length; i++) {
      id = entries[i][this.conf.uniqueKey];
      if (this.data.indexOf(id) !== -1) {
        this.data.splice(this.data.indexOf(id), 1);
        this.destroyIndex(id);
        this.conf.driver.removeItem(id);
        this.conf.driver.setItem('__data', this.data.join(','));
      }
    }
  };

  // Count number of entries
  // Returns [integer]
  Database.prototype.count = function () {
    return this.data.length;
  };

  // Drop database
  // Returns [boolean]
  Database.prototype.drop = function () {
    for (var i = 0, len = this.data.length; i < len; i++) {
      this.delete(this.data[i]);
    }
    this.conf.driver.removeItem('__data');
    this.data.length = 0;
    return this.data.length === 0;
  };

  // [PRIVATE]
  // Load database
  Database.prototype.load = function () {
    return this.conf.driver.getItem('__data') ? this.conf.driver.getItem('__data').split(',') : null;
  };

  // [PRIVATE]
  // Building search index
  Database.prototype.buildIndex = function ( id, obj ) {
    var key, index, value = [id];
    for (var property in obj) {
      if (this.conf.indexedKeys.indexOf(property) !== -1) {
        key = property + ':' + obj[property];
        index = this.conf.driver.getItem(key);
        if (index !== null) {
          index.push(id);
          value = index;
        }
        this.conf.driver.setItem(key, value);
      }
    }
  };

  // [PRIVATE]
  // Destroying the search index
  Database.prototype.destroyIndex = function ( id ) {
    var key, index, item = this.conf.driver.getItem(id);
    if(item !== null) {
      for(var property in item) {
        if(this.conf.indexedKeys.indexOf(property) !== -1) {
          key = property + ':' + item[property];
          index = this.conf.driver.getItem(key);
          if (index !== null) {
            index.splice(index.indexOf(id), 1);
            if(index.length === 0) {
              this.conf.driver.removeItem(key);
            } else {
              this.conf.driver.setItem(key, index);
            }
          }
        }
      }
    }
  };

  // [PRIVATE]
  var intersect = function () {
    var i, shortest, nShortest, n, len, ret = [], obj = {}, nOthers;
    nOthers = arguments.length - 1;
    nShortest = arguments[0].length;
    shortest = 0;
    for (i = 0; i <= nOthers; i++) {
      n = arguments[i].length;
      if (n < nShortest) {
        shortest = i;
        nShortest = n;
      }
    }

    for (i = 0; i <= nOthers; i++) {
      n = (i === shortest) ? 0 : (i || shortest);
      len = arguments[n].length;
      for (var j = 0; j < len; j++) {
        var elem = arguments[n][j];
        if (obj[elem] === i - 1) {
          if (i === nOthers) {
            ret.push(elem);
            obj[elem] = 0;
          } else {
            obj[elem] = i;
          }
        } else if (i === 0) {
          obj[elem] = 0;
        }
      }
    }
    return ret;
  };

  exports.Database = Database;
  exports.Database.drivers = {};
} (window));