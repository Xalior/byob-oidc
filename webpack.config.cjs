const path = require('path')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')

module.exports = {
    plugins: [new MiniCssExtractPlugin()],
    entry: './src/themes/nbn25/main.ts',
    output: {
        filename: 'main.js',
        path: path.resolve(__dirname, 'public/themes/nbn25')
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    devServer: {
        static: path.resolve(__dirname, 'public'),
        port: 8080,
        hot: true
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: {
                    loader: 'ts-loader',
                    options: {
                        transpileOnly: true
                    }
                },
                exclude: /node_modules/
            },
            {
                mimetype: 'image/svg+xml',
                scheme: 'data',
                type: 'asset/resource',
                generator: {
                    filename: 'icons/[hash].svg'
                }
            },
            {
                test: /\.(scss)$/,
                use: [
                    {
                        // Extracts CSS for each JS file that includes CSS
                        loader: MiniCssExtractPlugin.loader
                    },
                    {
                        loader: 'css-loader'
                    },
                    {
                        loader: 'postcss-loader',
                        options: {
                            postcssOptions: {
                                plugins: () => [
                                    require('autoprefixer')
                                ]
                            }
                        }
                    },
                    {
                        loader: 'sass-loader'
                    }
                ]
            }
        ]
    }
}
