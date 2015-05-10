'use strict';

exports.POST_RESOURCE = {
    slug: 'post-resource',
    error: {
        reason: 'POST /:model/:id is not allowed.',
    },
    description: {
        mitigation: 'a) use PUT /:model/:id instead of POST to update or b) use POST /:model to create a new resource'
    }
};

exports.UNKNOWN_TYPE = {
    slug: 'unknown-type',
    error: {
        reason: 'path extension none of (json|xml|yml)'
    },
    description: {
        mitigation: 'a) specify Accept: header instead, b) request the url with one of (json|xml|yml) as extension'
    }
};