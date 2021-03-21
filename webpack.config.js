const webpack = require('webpack');

module.exports = (env = {}) => {
    return {
        devtool: 'source-map',

        node: {
            fs: "empty",
            module: "empty"
        },

        externals: {
            "sinap-core": 'sinap-core',
            "sinap-types": 'sinap-types'
        },

        output: {
            path: './lib',
            filename: '[name].js',
            sourceMapFilename: '[name].js.map',
            library: 'sinap-typescript-loader',
            libraryTarget: 'umd',
        },

        resolve: {
            extensions: ['.ts', '.js']
        },

        target: 'web',

        entry: {
            'index': './src/index',
        },

        module: {
            loaders: [
                {
                    test: /\.ts$/,
                    loader: 'ts-loader',
                    options: {
                        compilerOptions: {
                            declaration: false
                        }
                    }
                },
            ]
        },
    };
};