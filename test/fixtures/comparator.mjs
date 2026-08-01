/**
 * Compare two values using lexical or numeric comparison,
 * @param {String|Number} a
 * @param {String|Number} b
 * @return {SortResult}
 */
export function comparator(a, b){
	if(a < b) return -1;
	if(a > b) return  1;
	return 0;
}

/**
 * Value returned from a sorting comparator.
 * @typedef {Number} SortResult
 * @var {Number} [EQUAL_TO     =  0] Both arguments are equal.
 * @var {Number} [LESS_THAN    = -1] First argument precedes the second.
 * @var {Number} [GREATER_THAN =  1] First argument succeeds the second.
 */

/**
 * @typedef {String} NullByteEscapeStrategy
 * @var {String} error  - Throw a {@link TypeError}.
 * @var {String} escape - Insert a backslash before each null-byte.
 * @var {String} ignore - Keep null-bytes as they are (default).
 * @var {String} strip  - Remove null-bytes entirely.
 */
