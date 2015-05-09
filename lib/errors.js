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