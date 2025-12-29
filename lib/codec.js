import FSP from 'node:fs/promises';
import {
	ID, TYPE,
	Color,
	BOOLEAN_TYPE, FLOAT_TYPE, POSITIVE_FLOAT_TYPE, DURATION_TYPE, STRING_TYPE, COLOR_TYPE, EnumType,
	PropertySpace,
	Preset,
	BUILT_IN_VIEW_PROPERTIES, BUILT_IN_VIEW_TYPES, ViewPreset, View,
	BUILT_IN_ENTITY_PROPERTIES, BUILT_IN_ENTITY_TYPES, EntityPreset, Entity,
	BUILT_IN_TRANSITION_PROPERTIES, BUILT_IN_TRANSITION_TYPES, TransitionPreset, Transition,
} from './model.js';

const ERROR_CONTEXT = 3;
const REPLACE_TAB = '⇥  ';

export class ParseError extends Error {

	#source;
	#lineOffset;
	#lines = [];
	#lineIndex; // 0-based
	#columnIndex; // 0-based
	#problem;

	constructor( source, lines, lineIndex, columnIndex, problem) {
		super( `${ source? source + ' ': ''}line ${ lineIndex + 1} column ${ columnIndex + 1}: ${ problem}`);
		this.#source = source;
		this.#lineOffset = Math.max( 0, lineIndex - ERROR_CONTEXT);
		for( let i = this.#lineOffset; i < lines.length && i <= lineIndex + ERROR_CONTEXT; i++)
			this.#lines.push( lines[ i]);
		this.#lineIndex = lineIndex;
		this.#columnIndex = columnIndex;
		this.#problem = problem;
	}

	get source() {
		return this.#source;
	}

	get lineIndex() {
		return this.#lineIndex;
	}

	get columnIndex() {
		return this.#columnIndex;
	}

	get problem() {
		return this.#problem;
	}

	print() {
		if( this.#source)
			console.error( this.#source + ':');
		const lnWidth = `${ this.#lineOffset + this.#lines.length}`.length;
		for( let i = 0; i < this.#lines.length; i++) {
			const lineNumCol = `${ this.#lineOffset + i + 1}`.padStart( lnWidth, ' ');
			console.error( lineNumCol + ': ' + this.#lines[ i].replaceAll( '\t', REPLACE_TAB));
			if( this.#lineOffset + i === this.#lineIndex) {
				console.error( ' '.repeat( lineNumCol.length) + '┌─'
						+ this.#lines[ i]
								.substring( 0, this.#columnIndex)
								.replaceAll( '\t', REPLACE_TAB)
								.replace( /./g, '─')
						+ '┘');
				console.error( ' '.repeat( lineNumCol.length) + "└─" + this.#problem);
			}
		}
	}
}

const LINE = /^(\t*)([^\t].*)?$/;
const TOKEN = new RegExp( '(?:'
		+ '(?<sp> +)' + '|'
		+ '(?<comment># .*$)' + '|'
		+ '(?<colon>:(?!=))' + '|'
		+ '(?<coloneq>:=)' + '|'
		+ '(?<eq>=)' + '|'
		+ '(?<at>@)' + '|'
		+ '(?<lbracket>\\[)' + '|'
		+ '(?<rbracket>\\])' + '|'
		+ '(?<dot>\\.)' + '|'
		+ '(?<num>(?:-?0|[1-9][0-9]*)(?:\\.[0-9]+)?)' + '|'
		+ '(?<color>#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3})?(?![0-9A-Za-z]))' + '|'
		+ '(?<str>\'(?:[^\\\\\']+|\\\\.)*\')' + '|'
		+ '(?<id>[a-z][0-9a-z]*(?:-[0-9a-z]+)*(?![0-9A-Za-z\-_]))' + '|'
		+ '(?<type>[A-Z][0-9A-Za-z]*)'
		+ ')', 'y');
const RESERVED_ID = new Set( [
	'true',
	'false',
]);

export class CodecConfig {

	#viewPropertySpaces = [ BUILT_IN_VIEW_PROPERTIES];
	#entityPropertySpaces = [ BUILT_IN_ENTITY_PROPERTIES];
	#transitionPropertySpaces = [ BUILT_IN_TRANSITION_PROPERTIES];
	#subjectTypesByName = new Map();
	#subjectTypesToName = new Map();
	#transitionTypesByName = new Map();
	#transitionTypesToName = new Map();

	constructor() {
		this.extendSubjectType( ViewPreset.name, ViewPreset);
		this.extendSubjectType( EntityPreset.name, EntityPreset);
		this.extendSubjectType( TransitionPreset.name, TransitionPreset);
		for( const [ name, type] of Object.entries( BUILT_IN_VIEW_TYPES))
			this.extendSubjectType( name, type);
		for( const [ name, type] of Object.entries( BUILT_IN_ENTITY_TYPES))
			this.extendSubjectType( name, type);
		for( const [ name, type] of Object.entries( BUILT_IN_TRANSITION_TYPES))
			this.extendTransitionType( name, type);
	}

	extendViewProperties( propertySpace) {
		for( const existingPropertySpace of this.#viewPropertySpaces)
			for( const name of propertySpace.names())
				if( existingPropertySpace.getType( name) !== undefined)
					throw new Error( `view property already defined: ${ name}`);
		this.#viewPropertySpaces.push( propertySpace);
	}

	createViewPropertySpace() {
		return new PropertySpace( this.#viewPropertySpaces);
	}

	extendEntityProperties( propertySpace) {
		for( const existingPropertySpace of this.#entityPropertySpaces)
			for( const name of propertySpace.names())
				if( existingPropertySpace.getType( name) !== undefined)
					throw new Error( `entity property already defined: ${ name}`);
		this.#entityPropertySpaces.push( propertySpace);
	}

	createEntityPropertySpace() {
		return new PropertySpace( this.#entityPropertySpaces);
	}

	extendTransitionProperties( propertySpace) {
		for( const existingPropertySpace of this.#transitionPropertySpaces)
			for( const name of propertySpace.names())
				if( existingPropertySpace.getType( name) !== undefined)
					throw new Error( `transition property already defined: ${ name}`);
		this.#transitionPropertySpaces.push( propertySpace);
	}

	createTransitionPropertySpace() {
		return new PropertySpace( this.#transitionPropertySpaces);
	}

	extendSubjectType( name, type) {
		if( this.#subjectTypesByName.has( name))
			throw new Error( `type name collision: ${ name}`);
		if( this.#subjectTypesToName.has( type))
			throw new Error( `type collision: ${ type}`);
		if( !TYPE.test( name))
			throw new Error( `illegal type name: ${ name}`);
		if( !( type.prototype instanceof Preset) && !( type.prototype instanceof View) && !( type.prototype instanceof Entity))
			throw new Error( `illegal type: ${ type}`);
		this.#subjectTypesByName.set( name, type);
		this.#subjectTypesToName.set( type, name);
	}

	getSubjectType( name) {
		return this.#subjectTypesByName.get( name);
	}

	extendTransitionType( name, type) {
		if( this.#transitionTypesByName.has( name))
			throw new Error( `transition name collision: ${ name}`);
		if( this.#transitionTypesToName.has( type))
			throw new Error( `transition type collision: ${ type}`);
		if( !ID.test( name))
			throw new Error( `illegal transition name: ${ name}`);
		if( !( type.prototype instanceof Transition))
			throw new Error( `illegal transition type: ${ type}`);
		this.#transitionTypesByName.set( name, type);
		this.#transitionTypesToName.set( type, name);
	}

	getTransitionType( name) {
		return this.#transitionTypesByName.get( name);
	}
}

export class Codec extends CodecConfig {

	async parseFile( file) {
		return this.parse( await FSP.readFile( file, 'utf-8'), file);
	}

	parse( script, source = undefined) {
		const stack = [ new RootParser( this)];
		const lines = script.split( '\n', -1);
		for( let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
			const lineMatch = LINE.exec( lines[ lineIndex]); // always succeeds
			if( lineMatch[ 2] === undefined || lineMatch[ 2].startsWith( '#'))
				continue;
			const indent = lineMatch[ 1].length;
			if( lineMatch[ 2].startsWith( ' '))
				throw new ParseError( source, lines, lineIndex, indent, 'space-indentation is illegal');
			if( indent > stack.length - 1)
				throw new ParseError( source, lines, lineIndex, indent, 'wrong indentation');
			while( stack.length - 1 > indent)
				stack.pop().end();
			const parser = stack[ stack.length - 1].appendLine( new Tokens( source, lines, lineIndex, indent));
			if( parser)
				stack.push( parser);
		}
		while( stack.length > 1)
			stack.pop().end();
		return stack[ 0].end();
	}
}

class Tokens {

	#source;
	#lines;
	#lineIndex;
	#effectiveLineLength;
	#tokens = [];

	// tokens not empty
	constructor( source, lines, lineIndex, indent) {
		this.#source = source;
		this.#lines = lines;
		this.#lineIndex = lineIndex;
		this.#effectiveLineLength = lines[ lineIndex].length; // shortened if a comment is seen
		for( let position = TOKEN.lastIndex = indent; position < lines[ lineIndex].length; position = TOKEN.lastIndex) {
			const tokenMatch = TOKEN.exec( lines[ lineIndex]);
			if( !tokenMatch)
				throw new ParseError( source, lines, lineIndex, position, 'unknown token');
			if( tokenMatch.groups.sp !== undefined)
				continue;
			if( tokenMatch.groups.comment !== undefined) {
				this.#effectiveLineLength = position;
				break;
			}
			let matchedName = undefined;
			for( const name in tokenMatch.groups)
				if( tokenMatch.groups[ name] !== undefined)
					if( matchedName !== undefined)
						throw new Error( `parser bug: multiple groups matched: ${ matchedName}, ${ name}`);
					else
						matchedName = name;
			if( matchedName === undefined)
				throw new Error( `parser bug: no group matched`);
			this.#tokens.push( { position, name: matchedName, value: tokenMatch[ 0]});
		}
	}

	token( index) {
		return this.#tokens[ index];
	}

	raw( startInc, endExc = undefined) {
		return this.#lines[ this.#lineIndex].substring(
				this.#tokens[ startInc].columnIndex,
				endExc === undefined || endExc >= this.#tokens.length
						? this.#effectiveLineLength
						: this.#tokens[ endExc].columnIndex)
				.trimEnd();
	}

	expectName( index, names, nameInErrorMessage) {
		const token = this.expectNameOrEnd( index, names, nameInErrorMessage);
		if( token === undefined)
			throw new ParseError( this.#source, this.#lines, this.#lineIndex, this.#effectiveLineLength, `${ nameInErrorMessage} expected: EOL`);
		return token;
	}

	expectNameOrEnd( index, names, nameInErrorMessage) {
		if( index >= this.#tokens.length)
			return undefined;
		const token = this.#tokens[ index];
		if( typeof names === 'string'? token.name !== names: !names.includes( token.name))
			throw new ParseError( this.#source, this.#lines, this.#lineIndex, token.position, `${ nameInErrorMessage} expected: ${ token.value}(${ token.name})`);
		return token;
	}

	expectValue( index, value) {
		if( index >= this.#tokens.length)
			throw new ParseError( this.#source, this.#lines, this.#lineIndex, this.#effectiveLineLength, `"${ value}" expected: EOL`);
		const token = this.#tokens[ index];
		if( token.value !== value)
			throw new ParseError( this.#source, this.#lines, this.#lineIndex, token.position, `"${ value}" expected: ${ token.value}`);
		return token;
	}

	expectValueOrEnd( index, value) {
		if( index >= this.#tokens.length)
			return undefined;
		const token = this.#tokens[ index];
		if( token.value !== value)
			throw new ParseError( this.#source, this.#lines, this.#lineIndex, token.position, `"${ value}" or EOL expected: ${ token.value}`);
		return token;
	}

	expectBracketedListWithName( startingIndex, names, nameInErrorMessage) {
		this.expectValue( startingIndex, '[');
		const found = [];
		for( let index = startingIndex + 1; index < this.#tokens.length; index++) {
			if( this.#tokens[ index].value === ']')
				return found;
			found.push( this.expectName( index, names, nameInErrorMessage));
		}
		throw new ParseError( this.#source, this.#lines, this.#lineIndex, this.#effectiveLineLength, '"]" expected: EOL');
	}

	expectEnd( index) {
		if( index < this.#tokens.length)
			throw new ParseError( this.#source, this.#lines, this.#lineIndex, this.#tokens[ index].position, `EOL expected: ${ this.#tokens[ index].value}`);
	}

	newError( index, problem) {
		return new ParseError( this.#source, this.#lines, this.#lineIndex, this.#tokens[ index].position, problem);
	}
}

class PresetDomain {

	propertySpace;
	presetClass;
	defaultPreset;
	defaultPresetAllowed = true;

	constructor( propertySpace, presetClass) {
		this.propertySpace = propertySpace;
		this.presetClass = presetClass;
		this.defaultPreset = new presetClass( propertySpace, []);
	}
}

class RootParser {

	#config;
	#viewPresets;
	#entityPresets;
	#transitionPresets;
	#aliases = new Map();
	#references = new Map();
	#transitions = [];

	constructor( config) {
		this.#config = config;
		this.#viewPresets = new PresetDomain( config.createViewPropertySpace(), ViewPreset);
		this.#entityPresets = new PresetDomain( config.createEntityPropertySpace(), EntityPreset);
		this.#transitionPresets = new PresetDomain( config.createTransitionPropertySpace(), TransitionPreset);
	}

	appendLine( tokens) {
		const token0 = tokens.expectName( 0, [ 'id', 'type'], 'id or type');
		if( token0.name === 'id') { // <id> ...
			if( RESERVED_ID.has( token0.value))
				throw tokens.newError( 0, `invalid id: ${ token0.value}`);
			const token1 = tokens.expectName( 1, [ 'coloneq', 'colon', 'id'], '":=", "[", or transition type');
			if( token1.name === 'coloneq')
				return this.#parseAlias( tokens, ID, 'id'); // <id> :=
			if( token1.name === 'colon') {
				const { target, end} = this.#newTarget( token0.value, tokens, 2);
				if( target instanceof Preset) {
					tokens.expectEnd( end);
					return new ParameterParser( target, undefined, true);
				}
				const transition = this.#newTransition( target, false, tokens, end);
				if( transition)
					this.#transitions.push( transition);
				return new ParameterParser( target, transition, true);
			}
			const target = this.#references.get( token0.value);
			if( !target)
				throw tokens.newError( 0, `id undefined: ${ token0.value}`);
			const transition = this.#newTransition( target, true, tokens, 1);
			this.#transitions.push( transition);
			return new ParameterParser( target, transition, false);
		}

		const { target, end} = this.#newTarget( undefined, tokens, 0);
		if( target instanceof Preset) {
			tokens.expectEnd( end);
			return new ParameterParser( target, undefined, true);
		}
		const transition = this.#newTransition( target, true, tokens, end);
		this.#transitions.push( transition);
		return new ParameterParser( target, transition, true);
	}

	#parseAlias( tokens, regex, nameInErrorMessage) {
		const alias = tokens.token( 0).value;
		if( this.#aliases.has( alias) || this.#config.getSubjectType( alias) || this.#config.getTransitionType( alias))
			throw tokens.newError( 0, `${ nameInErrorMessage} already exists: ${ alias}`);
		const raw = tokens.raw( 2);
		if( !regex.test( raw))
			throw tokens.newError( 2, `not a valid ${ nameInErrorMessage}: ${ raw}`);
		this.#aliases.set( alias, raw);
	}

	#newTarget( id, tokens, start) {
		const token0 = tokens.expectName( start, 'type', 'type name');
		const token1 = tokens.expectNameOrEnd( start + 1, [ 'lbracket', 'id'], '"[", transition type, or end-of-line');
		const baseTokens = token1 && token1.name === 'lbracket'
				? tokens.expectBracketedListWithName( start + 1, 'id', 'preset name')
				: [];
		const end = token1 && token1.name === 'lbracket'
				? start + 1 + 1 + baseTokens.length + 1 // type [ ... ]
				: start + 1; // type

		const type = this.#config.getSubjectType( this.#aliases.get( token0.value) || token0.value);
		if( !type)
			throw tokens.newError( start, `unknown type: ${ token0.value}`);
		if( type === ViewPreset)
			return { target: this.#newPreset( this.#viewPresets, id, baseTokens, tokens, start), end};
		else if( type === EntityPreset)
			return { target: this.#newPreset( this.#entityPresets, id, baseTokens, tokens, start), end};
		else if( type === TransitionPreset)
			return { target: this.#newPreset( this.#transitionPresets, id, baseTokens, tokens, start), end};
		else if( type.prototype instanceof View)
			return { target: this.#newSubject( this.#viewPresets, id, type, baseTokens, tokens, start), end};
		else if( type.prototype instanceof Entity)
			return { target: this.#newSubject( this.#entityPresets, id, type, baseTokens, tokens, start), end};
		else
			throw new Error( `bug: unrecognized type: ${ type}`); // bug because already checked on registration
	}

	#newPreset( domain, id, baseTokens, tokens, start) {
		if( id === undefined) {
			if( baseTokens.length)
				throw tokens.newError( start + 2, `default preset cannot inherit from another: ${ baseTokens[ 0].value}`);
			if( !domain.defaultPresetAllowed)
				throw tokens.newError( 0, 'default preset can be defined only once, and must be before any other preset');
			return domain.defaultPreset;
		}
		if( this.#references.has( id))
			throw tokens.newError( 0, `id collision: ${ id}`);
		const instance = new domain.presetClass( domain.propertySpace,
				this.#loadPresets( domain, baseTokens, tokens, start + 2));
		this.#references.set( id, instance);
		domain.defaultPresetAllowed = false;
		return instance;
	}

	#newSubject( domain, id, type, baseTokens, tokens, start) {
		if( id !== undefined && this.#references.has( id))
			throw tokens.newError( 0, `id collision: ${ id}`);
		const instance = new type( this.#loadPresets( domain, baseTokens, tokens, start + 2), id);
		if( id !== undefined)
			this.#references.set( id, instance);
		return instance;
	}

	#newTransition( target, required, tokens, start) {
		const token0 = required
				? tokens.expectName( start, 'id', 'transition type')
				: tokens.expectNameOrEnd( start, 'id', 'transition type or end-of-line');
		if( token0 === undefined)
			return undefined;
		const token1 = tokens.expectNameOrEnd( start + 1, [ 'lbracket', 'id'], '"[", trigger condition, or end-of-line');
		const baseTokens = token1 && token1.name === 'lbracket'
				? tokens.expectBracketedListWithName( start + 1, 'id', 'preset name')
				: [];
		const end = token1 && token1.name === 'lbracket'
				? start + 1 + 1 + baseTokens.length + 1 // transition [ ... ]
				: start + 1; // transition

		const type = this.#config.getTransitionType( this.#aliases.get( token0.value) || token0.value);
		if( !type)
			throw tokens.newError( start, `unknown transition type: ${ token0.value}`);
		const transition = new type( this.#loadPresets( this.#transitionPresets, baseTokens, tokens, start + 2), target);
		const tokenLast = tokens.expectValueOrEnd( end, 'auto');
		if( tokenLast)
			tokens.expectEnd( end + 1);
		transition.auto = tokenLast !== undefined;
		return transition;
	}

	#loadPresets( domain, baseTokens, tokens, start) {
		if( !baseTokens.length)
			return [ domain.defaultPreset];
		const basePresets = [];
		for( let i = 0; i < baseTokens.length; i++) {
			const reference = this.#references.get( baseTokens[ i].value);
			if( reference === undefined)
				throw tokens.newError( start + i, `id undefined: ${ baseTokens[ i].value}`);
			if( !( reference instanceof domain.presetClass))
				throw tokens.newError( start + i, `${ domain.presetClass.name} expected, found: ${ reference.constructor.name}`);
			basePresets.push( reference);
		}
		return basePresets;
	}

	end() {
		return this.#transitions;
	}
}

class ParameterParser {

	#target;
	#transition;
	#newTarget;

	constructor( target, transition, newTarget) {
		this.#target = target;
		this.#transition = transition;
		this.#newTarget = newTarget;
	}

	appendLine( tokens) {
		const token0 = tokens.expectName( 0, 'id', 'property name');
		const token1 = tokens.expectName( 1, [ 'coloneq', 'eq', 'at'], '":=", "=", or "@"');
		switch( token1.value) {
			case ':=': {
				if( !this.#newTarget)
					throw tokens.newError( 1, `:= only allowed in target defining blocks`);
				if( this.#target instanceof TransitionPreset)
					throw tokens.newError( 1, `:= not allowed in transition preset blocks`);
				const propertyType = this.#target.propertySpace.getType( token0.value);
				if( !propertyType)
					throw tokens.newError( 0, `unknown property: ${ token0.value}`);
				this.#target.set( token0.value, this.#parseValue( propertyType, tokens, 2));
				return;
			}
			case '=': {
				if( this.#transition) {
					const parameterType = this.#transition.getParameterType( token0.value);
					if( !parameterType)
						throw tokens.newError( 0, `unknown transition parameter: ${ token0.value}`);
					this.#transition.setParameter( token0.value, this.#parseValue( propertyType, tokens, 2));
					return;
				}
				if( this.#target instanceof TransitionPreset)
					throw tokens.newError( 1, `transition parameters not allowed in presets`);
				throw tokens.newError( 1, `no transition associated`);
			}
			case '@': {
				if( this.#transition) {
					const propertyType = this.#transition.propertySpace.getType( token0.value);
					if( !propertyType)
						throw tokens.newError( 0, `unknown transition property: ${ token0.value}`);
					this.#transition.set( token0.value, this.#parseValue( propertyType, tokens, 2));
					return;
				}
				if( this.#target instanceof TransitionPreset) {
					const propertyType = this.#target.propertySpace.getType( token0.value);
					if( !propertyType)
						throw tokens.newError( 0, `unknown transition property: ${ token0.value}`);
					this.#target.set( token0.value, this.#parseValue( propertyType, tokens, 2));
					return;
				}
				throw tokens.newError( 1, `no transition associated`);
			}
			default:
				throw new Error( `bug`);
		}
	}

	#parseValue( propertyType, tokens, start) {
		if( propertyType === BOOLEAN_TYPE) {
			const token = tokens.expectName( start, 'id', 'boolean value');
			if( token.value !== 'true' || token.value !== 'false')
				throw tokens.newError( start, `boolean value expected: ${ token.value}`);
			return token.value === 'true';
		}

		if( propertyType === FLOAT_TYPE)
			return Number.parseFloat( tokens.expectName( start, 'num', 'number').value);
	
		if( propertyType === POSITIVE_FLOAT_TYPE) {
			const token = tokens.expectName( start, 'num', 'number');
			const value = Number.parseFloat( token.value);
			if( Number.isFinite( value) && value > 0)
				return value;
			throw tokens.newError( start, `positive number expected: ${ token.value}`);
		}

		if( propertyType === DURATION_TYPE) {
			const token0 = tokens.expectName( start, 'num', 'duration');
			const num = Number.parseFloat( token0.value);
			const token1 = tokens.expectName( start + 1, 'id', 'duration unit (s, ms)');
			switch( token1.value) {
				case 'ms':
					if( !( num >= 0))
						throw tokens.newError( start, `duration must be positive`);
					return num;
				case 's': 
					if( !( num >= 0))
						throw tokens.newError( start, `duration must be positive`);
					return num * 1000;
				default:
					throw tokens.newError( start + 1, `duration unit (s, ms) expected: ${ token1.value}`);
			}
		}

		if( propertyType === STRING_TYPE)
			return this.#decodeString( tokens.expectName( start, 'str', 'text string'), tokens, start);

		if( propertyType === COLOR_TYPE)
			return Color.of( tokens.expectName( start, 'color', 'color code').value);

		if( propertyType instanceof EnumType) {
			const string = this.#decodeString( tokens.expectName( start, 'str', propertyType.name), tokens, start);
			if( propertyType.values.includes( string))
				return string;
			throw tokens.newError( start, `one of the following values expected: ${ propertyType.values.join( ', ')}`);
		}

		throw tokens.newError( start, `property type ${ propertyType} not supported in this version`); // TODO
	}

	#decodeString( token, tokens, start) {
		return token.value.substring( 1, token.value.length - 1).replace( /[^\\]|\\./, match => {
			if( !match.startsWith( '\\'))
				return match;
			switch( match.substring( 1)) {
				case '\\': return '\\';
				case '\'': return '\'';
				case 'n': return '\n';
				case 'r': return '\r';
				case 't': return '\t';
				default: throw tokens.newError( start, `unsupported escape sequence: ${ match}`);
			}
		});
	}

	end() {
		// do nothing
	}
}
