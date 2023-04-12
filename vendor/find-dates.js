"use strict";

// From https://github.com/hutsoninc/find-dates/

var months = {
    january: {
        variants: ['jan']
    },
    february: {
        variants: ['feb']
    },
    march: {
        variants: ['mar']
    },
    april: {
        variants: ['apr']
    },
    may: {
        variants: []
    },
    june: {
        variants: ['jun']
    },
    july: {
        variants: ['jul']
    },
    august: {
        variants: ['aug']
    },
    september: {
        variants: ['sep', 'sept']
    },
    october: {
        variants: ['oct']
    },
    november: {
        variants: ['nov']
    },
    december: {
        variants: ['dec']
    }
};
var days = {
    sunday: {
        variants: ['sun']
    },
    monday: {
        variants: ['mon']
    },
    tuesday: {
        variants: ['tues', 'tue', 'tu']
    },
    wednesday: {
        variants: ['wed']
    },
    thursday: {
        variants: ['thurs', 'thur', 'thu', 'th']
    },
    friday: {
        variants: ['fri']
    },
    saturday: {
        variants: ['sat']
    }
};

//# sourceMappingURL=months.js.map
var utils_1 = {
    monthVariations: Object.keys(months).map(month => [month].concat(months[month].variants).flat()),
    dayVariations: Object.keys(days).map(day => [day].concat(days[day].variants).flat()),
}

// var create_tests_1 = require("./create-tests");
var create_tests_1 = {
    default: function createTests(options) {
        // Common expressions
        var expressions = {
            dayString: '((' + utils_1.dayVariations.join('|') + ').?,?)',
            month: '(' + utils_1.monthVariations.join('|') + ').?',
            year: '(' +
                // Include numbers 00-99 (with optional ' in front) and 0000-9999
                '(\\d{4}|\'?\\d{2})' +
                ')',
            monthNumbers: '([1][0-2]|[0]?[0-9])',
            dayNumbers: '([3][0-1]|[0-2]?[0-9])',
            yearNumbers: '(\\d{4}|\\d{2})'
        };
        expressions.day = '(' +
            // 01-31
            expressions.dayNumbers +
            // End of line, space after, comma after, or 'st', 'nd', 'rd', 'th' (doesn't include in match)
            '(?=($|\\s|,|(st|nd|rd|th)))' +
            ')' +
            // Include 'st', 'nd', 'rd', 'th' in match (optional)
            '(st|nd|rd|th)?';
        // Regex matchers to loop over against input
        var tests = [];
        tests.push(expressions.month + '\\s+(the\\s+)?' + expressions.day);
        tests.push(expressions.month + '\\s+' + expressions.day + ',?\\s+' + expressions.year);
        tests.push('\\b' + expressions.monthNumbers + '[' + options.delimiters + ']' + expressions.dayNumbers + '[' + options.delimiters + ']' + expressions.yearNumbers);
        tests.push(expressions.month + '\\s+(of\\s+)?' + expressions.year);
        tests.push('\\b' + expressions.day + '\\s+of\\s+' + expressions.month);
        return tests.map(function (str) { return new RegExp(str, 'gi'); });
    }
}

window.findDates = function findDates(input, options) {
    options = Object.assign({
        delimiters: '-/'
    }, options);
    var tests = create_tests_1.default(options);
    var match = [];
    for (var i = 0; i < tests.length; i++) {
        var test_1 = tests[i];
        var testMatch = [];
        var result = void 0;
        while ((result = test_1.exec(input))) {
            testMatch.push({
                match: result[0],
                index: result.index
            });
        }
        match = match.concat(testMatch);
    }
    // Loop over matches, remove less specific matches with same index
    match = filterMatches(match);
    // Sort matches by index
    match.sort(function (a, b) {
        a = a.index;
        b = b.index;
        if (a < b)
            return -1;
        if (a > b)
            return 1;
        return;
    });
    return match;
}

function filterMatches(arr) {
    var filtered = [];
    var _loop_1 = function (i) {
        var current = arr[i];
        var matchIndex = filtered.findIndex(function (obj) { return obj.index === current.index; });
        if (matchIndex >= 0) {
            if (filtered[matchIndex].match.length < current.match.length) {
                filtered[matchIndex] = current;
            }
            return "continue";
        }
        filtered.push(current);
    };
    for (var i = 0; i < arr.length; i++) {
        _loop_1(i);
    }
    return filtered;
}
//# sourceMappingURL=index.js.map