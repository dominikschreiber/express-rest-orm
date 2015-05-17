'use strict';

exports.BULK_UPDATE = {
    slug: 'bulk-update',
    error: {
        reason: 'bulk update failed. did all resources exist?'
    },
    description: {
        mitigation: 'pass a list of resources in req.body, and make sure all resources to update do exist'
    }
};

exports.POST_RESOURCE = {
    slug: 'post-resource',
    error: {
        reason: 'POST /:model/:id is not allowed.',
    },
    description: {
        mitigation: 'a) use PUT /:model/:id instead of POST to update or b) use POST /:model to create a new resource'
    }
};

exports.UNKNOWN_FIELD = {
    slug: 'unknown-field',
    error: {
        reason: 'the :field of /:model/:id/:field is unknown.'
    },
    description: {
        mitigation: 'use OPTIONS /:model to get a list of (among others) all available :fields'
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