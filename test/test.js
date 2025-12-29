import ASSERT from 'node:assert/strict';
import PATH from 'node:path';
import TEST from 'node:test';
import { Codec, ParseError} from '@arcticnotes/keyframe-core';

TEST( 'example.ank', async() => {
	try {
		const parser = new Codec();
		const transitions = await parser.parseFile( PATH.join( import.meta.dirname, 'example.ank'));
		ASSERT.ok( transitions);
	} catch( error) {
		if( error instanceof ParseError)
			error.print();
		throw error;
	}
});
