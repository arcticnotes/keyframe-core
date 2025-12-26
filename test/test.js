import ASSERT from 'node:assert/strict';
import TEST from 'node:test';
import { KeyframeParser} from '@arcticnotes/keyframe-core';

TEST( 'smoke-test', async() => {
	const parser = new KeyframeParser();
	ASSERT.ok( parser);
});
