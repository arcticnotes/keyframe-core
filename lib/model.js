const PRIV = Symbol();

const COLOR = /^#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3})?$/;

export class Color {

	static of( string) {
		if( !COLOR.test( string))
			throw new Error( `illegal color code: ${ string}`);
		switch( string.length) {
			case 7: return new Color( PRIV,
					Number.parseInt( string.substring( 1, 3), 16),
					Number.parseInt( string.substring( 3, 5), 16),
					Number.parseInt( string.substring( 5, 7), 16));
			case 4: return new Color( PRIV,
					Number.parseInt( string.substring( 1, 2), 16) * 0x11,
					Number.parseInt( string.substring( 2, 3), 16) * 0x11,
					Number.parseInt( string.substring( 3, 4), 16) * 0x11);
			default:
				throw new Error( 'bug');
		}
	}

	#red;
	#green;
	#blue;

	constructor( priv, red, green, blue) {
		if( priv !== PRIV)
			throw new Error( `use ${ this.constructor.name}.of() method`);
		if( !( Number.isInteger( red) && Number.isInteger( green) && Number.isInteger( blue)
				&& red >= 0x00 && red <= 0xFF && green >= 0x00 && green <= 0xFF && blue >= 0x00 && blue <= 0xFF))
			throw new Error( 'illegal argument');
		this.#red = red;
		this.#green = green;
		this.#blue = blue;
	}

	toString() {
		return '#'
				+ this.#red.toString( 16).padStart( 2, '0')
				+ this.#green.toString( 16).padStart( 2, '0')
				+ this.#blue.toString( 16).padStart( 2, '0');
	}
}

/**
 * Property types are closed, all subclasses are defined in this module, if an extension needs new types, try composing
 * one from existing types. It is locked down because other parts of the program, such as the parser and the writer,
 * need a set of well-defined lexical rules. If you use JavaScript tricks to mimic a new type, it well definitely break
 * something somewhere.
 */
export class PropertyType {

	constructor( priv) {
		if( priv !== PRIV)
			throw new Error( 'types are closed, you are not supposed to extend it outside the core module');
	}
}

export const BOOLEAN_TYPE = new ( class extends PropertyType {

	get name() {
		return 'boolean';
	}

	validate( value) {
		if( typeof value === 'boolean')
			return value;
		throw new Error( `not a boolean value: ${ value}`);
	}

	equals( type) {
		return type === this;
	}
})( PRIV);

export const FLOAT_TYPE = new ( class extends PropertyType {

	get name() {
		return 'float';
	}

	validate( value) {
		if( typeof value === 'number' && Number.isFinite( value))
			return value;
		throw new Error( `not a finite floating-point number: ${ value}`);
	}

	equals( type) {
		return type === this;
	}
})( PRIV);

export const POSITIVE_FLOAT_TYPE = new ( class extends PropertyType {

	get name() {
		return 'positive-float';
	}

	validate( value) {
		if( typeof value === 'number' && Number.isFinite( value) && value > 0)
			return value;
		throw new Error( `not a finite floating-point positive number: ${ value}`);
	}

	equals( type) {
		return type === this;
	}
})( PRIV);

export const DURATION_TYPE = new ( class extends PropertyType {

	get name() {
		return 'duration';
	}

	validate( value) {
		if( typeof value === 'number' && Number.isFinite( value) && value >= 0)
			return value;
		throw new Error( `not duration in milliseconds: ${ value}`);
	}

	equals( type) {
		return type === this;
	}
})( PRIV);

export const STRING_TYPE = new ( class extends PropertyType {

	get name() {
		return 'string';
	}

	validate( value) {
		if( typeof value === 'string')
			return value;
		throw new Error( `not a string: ${ value}`);
	}

	equals( type) {
		return type === this;
	}
})( PRIV);

export const COLOR_TYPE = new ( class extends PropertyType {

	get name() {
		return 'color';
	}

	validate( value) {
		if( value instanceof Color)
			return value;
		throw new Error( `not a color: ${ value}`);
	}

	equals( type) {
		return type === this;
	}
})( PRIV);

export class EnumType extends PropertyType {

	static of( name, values) {
		if( typeof name !== 'string')
			throw new Error( `stirng name expected: ${ name}`);
		const copy = [ ...values];
		for( const item of copy)
			if( typeof item !== 'string')
				throw new Error( `string expected: ${ item}`);
		return new EnumType( PRIV, name, copy);
	}

	#name;
	#values;

	constructor( priv, name, values) {
		super( priv);
		this.#name = name;
		this.#values = values;
	}

	get name() {
		return this.#name;
	}

	get values() {
		return [ ...this.#values];
	}

	validate( value) {
		if( !this.#values.includes( value))
			throw new Error( `not a valid ${ this.#name}: ${ value}, accepted: ${ this.#values.join( ', ')}`);
		return value;
	}

	equals( type) {
		return type === this;
	}
}

export class TupleType extends PropertyType {

	static of( ...elementTypes) {
		const copy = [ ...elementTypes];
		for( const elementType of copy)
			if( !( elementType instanceof PropertyType))
				throw new Error( `invalid element type: ${ elementType}`);
		return new TupleType( PRIV, copy);
	}

	#elementTypes;

	constructor( priv, elementTypes) {
		super( priv);
		this.#elementTypes = elementTypes;
	}

	get name() {
		return `(${ this.#elementTypes.map( t => t.name).join( ',')})`;
	}

	validate( value) {
		if( !Array.isArray( value) || value.length !== this.#elementTypes.length)
			throw new Error( `not a ${ this.name} tuple: ${ value}`);
		for( let i = 0; i < this.#elementTypes.length; i++)
			this.#elementTypes[ i].validate( value[ i]);
		return value;
	}

	equals( type) {
		if( !( type instanceof TupleType) || type.#elementTypes.length !== this.#elementTypes.length)
			return false;
		for( let i = 0; i < this.#elementTypes.length; i++)
			if( !this.#elementTypes[ i].equals( type.#elementTypes[ i]))
				return false;
		return true;
	}
}

export class ListType extends PropertyType {

	static of( elementType) {
		if( !( elementType instanceof PropertyType))
			throw new Error( `not a type: ${ elementType}`);
		return new ListType( PRIV, elementType);
	}

	#elementType;

	constructor( PRIV, elementType) {
		super( PRIV);
		this.#elementType = elementType;
	}

	get name() {
		return `List<${ this.#elementType.name}>`;
	}

	validate( value) {
		if( !Array.isArray( value))
			throw new Error( `not a list: ${ value}`);
		for( const element of value)
			this.#elementType.validate( element);
		return value;
	}

	equals( type) {
		return type instanceof ListType && type.#elementType.equals( this.#elementType);
	}
}

export class DictionaryType extends PropertyType {

	static of( valueType) {
		if( !( valueType instanceof PropertyType))
			throw new Error( `not a type: ${ valueType}`);
		return new DictionaryType( PRIV, valueType);
	}

	#valueType;

	constructor( PRIV, valueType) {
		super( PRIV);
		this.#valueType = valueType;
	}

	get name() {
		return `Dict<${ this.#valueType.name}>`;
	}

	validate( value) {
		if( !Array.isArray( value))
			throw new Error( `not a dictionary: ${ value}`);
		for( const element of value) {
			if( !Array.isArray( element) || element.length !== 2)
				throw new Error( `not a dictionary: ${ value}`);
			const [ name, value] = element;
			if( typeof name !== 'string')
				throw new Error( `not a dictionary: ${ value}`);
			this.#valueType.validate( value);
		}
		return value;
	}

	equals( type) {
		return type instanceof DictionaryType && type.#valueType.equals( this.#valueType);
	}
}

export const ID = /^(?:[0-9a-z](?:[0-9a-z-]*[0-9a-z])?\.)*[a-z][0-9a-z]*(?:-[0-9a-z]+)*$/;
export const TYPE = /^(?:[0-9a-z](?:[0-9a-z-]*[0-9a-z])?\.)*[A-Z][0-9A-Za-z]*$/;

/**
 * An indexed collection of property name-type pairs. This object is immutable.
 */
export class PropertySpace {

	#localProperties = new Map(); // Map< string, Type>
	#subspaces = new Set(); // Set< PropertySpace>
	#allProperties = new Map(); // Map< string, Type>

	constructor( definitions) {
		for( const definition of definitions)
			if( definition instanceof PropertySpace)
				this.#addSubspace( definition);
			else
				this.#addProperty( definition, true);
	}

	#addSubspace( space) {
		if( this.#subspaces.has( space))
			return;
		this.#subspaces.add( space);
		for( const subspace of space.#subspaces)
			this.#addSubspace( subspace);
		for( const localProperty of space.#localProperties)
			this.#addProperty( localProperty, false);
	}

	#addProperty( [ name, type], local) {
		if( this.#allProperties.has( name))
			throw new Error( `duplicate property name ${ name}`);
		if( !ID.test( name))
			throw new Error( `illegal property name: ${ name}`);
		if( !( type instanceof PropertyType))
			throw new Error( `illegal type: ${ type}`);
		this.#allProperties.set( name, type);
		if( local)
			this.#localProperties.set( name, type);
	}

	getType( name) {
		return this.#allProperties.get( name);
	}

	names() {
		const that = this;
		return {
			[ Symbol.iterator]() {
				return that.#allProperties.keys();
			}
		}
	}

	[ Symbol.iterator]() {
		return this.#allProperties[ Symbol.iterator]();
	}
}

export class SparseObject {

	#propertySpace;
	#inherited; // Properties[], allowed to have values undefined in #space
	#local = new Map(); // Map< string, any>

	constructor( priv, propertySpace, inherited) {
		if( priv !== PRIV)
			throw new Error( `do not extend ${ this.constructor.name}, extend one of ${ View.constructor.name}, ${ Entity.constructor.name}, and ${ Transition.constructor.name}`);
		this.#propertySpace = propertySpace;
		this.#inherited = inherited;
	}

	get propertySpace() {
		return this.#propertySpace;
	}

	set( name, value) {
		const type = this.#propertySpace.getType( name);
		if( type === undefined)
			throw new Error( `property name undefined: ${ name}`);
		if( value === undefined)
			this.#local.delete( name);
		else
			this.#local.set( name, type.validate( value));
	}

	get( name) {
		if( this.#propertySpace.getType( name) === undefined)
			throw new Error( `property name undefined: ${ name}`);
		return this.#getWithDistance( name, undefined)[ 0];
	}

	#getWithDistance( name, maxDistance) {
		const localValue = this.#local.get( name);
		if( localValue !== undefined)
			return [ localValue, 0];
		if( maxDistance === 0)
			return [ undefined, undefined];
		let closestValueSoFar = undefined;
		let closestDistanceSoFar = maxDistance === undefined? undefined: maxDistance - 1;
		for( let i = this.#inherited.length - 1; i >= 0; i--) {
			const [ value, distance] = this.#inherited[ i].#getWithDistance( name, closestDistanceSoFar);
			if( distance === 0)
				return value;
			if( distance !== undefined) {
				closestValueSoFar = value;
				closestDistanceSoFar = distance;
			}
		}
		return [ closestValueSoFar, closestDistanceSoFar];
	}
}

export class Preset extends SparseObject {

	#name;

	constructor( priv, propertySpace, inherited, name) {
		super( priv, propertySpace, inherited);
		this.#name = name;
	}

	get name() {
		return this.#name;
	}
}

export class Subject extends SparseObject {

	#name;

	constructor( priv, propertySpace, inherited, name) {
		super( priv, propertySpace, inherited);
		this.#name = name;
	}

	get name() {
		return this.#name;
	}
}

export const PROJECTION_MODE = EnumType.of( 'projection-mode', [ 'orthographic', 'perspective']);
export const BUILT_IN_VIEW_PROPERTIES = new PropertySpace( [
	[ 'x'         , FLOAT_TYPE],
	[ 'y'         , FLOAT_TYPE],
	[ 'z'         , FLOAT_TYPE],
	[ 'pitch'     , FLOAT_TYPE],
	[ 'yaw'       , FLOAT_TYPE],
	[ 'roll'      , FLOAT_TYPE],
	[ 'projection', PROJECTION_MODE],
	[ 'width'     , POSITIVE_FLOAT_TYPE], // effective only if projection=orthographic
	[ 'height'    , POSITIVE_FLOAT_TYPE], // effective only if projection=orthographic
	[ 'h-fov'     , POSITIVE_FLOAT_TYPE], // effective only if projection=perspective
	[ 'v-fov'     , POSITIVE_FLOAT_TYPE], // effective only if projection=perspective
	[ 'background', COLOR_TYPE],
]);

export class ViewPreset extends Preset {

	constructor( propertySpace, inherited) {
		super( PRIV, propertySpace, inherited);
	}
}

export class View extends Subject {

	constructor( propertySpace, inherited, name = undefined) {
		super( PRIV, propertySpace, inherited, name);
	}
}

export class Screen extends View {

	constructor( inherited, name = undefined) {
		super( BUILT_IN_VIEW_PROPERTIES, inherited, name);
	}
}

export const BUILT_IN_VIEW_TYPES = Object.freeze( {
	Screen,
});

export const BUILT_IN_ENTITY_PROPERTIES = new PropertySpace( [
	[ 'x', FLOAT_TYPE],
	[ 'y', FLOAT_TYPE],
	[ 'z', FLOAT_TYPE],
	[ 'pitch', FLOAT_TYPE],
	[ 'yaw', FLOAT_TYPE],
	[ 'roll', FLOAT_TYPE],
	[ 'width', POSITIVE_FLOAT_TYPE],
	[ 'height', POSITIVE_FLOAT_TYPE],
	[ 'fill-color', COLOR_TYPE],
	[ 'edge-color', COLOR_TYPE],
	[ 'edge-width', POSITIVE_FLOAT_TYPE],
	[ 'line-color', COLOR_TYPE],
	[ 'line-width', POSITIVE_FLOAT_TYPE],
	[ 'text-color', COLOR_TYPE],
	[ 'font-family', STRING_TYPE],
	[ 'font-size', POSITIVE_FLOAT_TYPE],
	[ 'text', STRING_TYPE],
]);

export class EntityPreset extends Preset {

	constructor( propertySpace, inherited) {
		super( PRIV, propertySpace, inherited);
	}
}

export class Entity extends Subject {

	constructor( propertySpace, inherited, name = undefined) {
		super( PRIV, propertySpace, inherited, name);
	}
}

export class Rectangle extends Entity {

	constructor( inherited, name = undefined) {
		super( BUILT_IN_ENTITY_PROPERTIES, inherited, name);
	}
}

export const BUILT_IN_ENTITY_TYPES = Object.freeze( {
	Rectangle,
});

export const BUILT_IN_TRANSITION_PROPERTIES = new PropertySpace( [
	[ 'duration', DURATION_TYPE],
]);

export class TransitionPreset extends Preset {

	constructor( propertySpace, inherited) {
		super( PRIV, propertySpace, inherited);
	}
}

export class Transition extends SparseObject {

	#target;
	#auto;

	constructor( propertySpace, inherited, target) {
		super( PRIV, propertySpace, inherited);
		this.#target = target;
	}

	get target() {
		return this.#target;
	}

	get auto() {
		return this.#auto;
	}

	set auto( auto) {
		this.#auto = auto;
	}

	getParameterType( name) {
		throw new Error( `unimplemented: ${ this.constructor.name}.getParameterType()`);
	}

	getParameter( name) {
		throw new Error( `unimplemented: ${ this.constructor.name}.getParameter()`);
	}

	setParameter( name, value) {
		throw new Error( `unimplemented: ${ this.constructor.name}.setParameter()`);
	}
}

export class Appears extends Transition {

	constructor( inherited, target) {
		super( BUILT_IN_TRANSITION_PROPERTIES, inherited, target);
	}

	getParameterType( name) {
		return undefined;
	}

	getParameter( name) {
		return undefined;
	}

	setParameter( name, value) {
		throw new Error( `unsupported parameter: ${ name}`);
	}
}

export const BUILT_IN_TRANSITION_TYPES = Object.freeze( {
	'appears': Appears,
});
