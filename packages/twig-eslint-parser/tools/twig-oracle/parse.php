<?php

declare(strict_types=1);

require __DIR__ . '/vendor/autoload.php';

use Twig\Environment;
use Twig\Error\SyntaxError;
use Twig\Loader\ArrayLoader;
use Twig\Source;
use Twig\Token;
use Twig\TwigFilter;
use Twig\TwigFunction;
use Twig\TwigTest;

const USAGE = "Usage:\n"
    . "  php tools/twig-oracle/parse.php <fixtures directory>  write <name>.blocks.json beside each <name>.twig\n"
    . "  php tools/twig-oracle/parse.php --stdin               read template paths from stdin, print one JSON line each\n";

const MIDDLE_TAGS = ['else', 'elseif'];

if ($argc !== 2 || ($argv[1] !== '--stdin' && !is_dir($argv[1]))) {
    fwrite(STDERR, USAGE);
    exit(1);
}

$environment = new Environment(new ArrayLoader([]));
$environment->registerUndefinedFilterCallback(fn (string $name) => new TwigFilter($name, fn () => null));
$environment->registerUndefinedFunctionCallback(fn (string $name) => new TwigFunction($name, fn () => null));
$environment->registerUndefinedTestCallback(fn (string $name) => new TwigTest($name, fn () => null));
$twigVersion = Environment::VERSION;

function findBlockSources(Environment $environment, string $code): array
{
    $stream = $environment->tokenize(new Source($code, 'template'));
    $blocks = [];
    $start = null;
    $tagName = null;
    while (!$stream->isEOF()) {
        $token = $stream->next();
        if ($token->test(Token::VAR_START_TYPE) || $token->test(Token::BLOCK_START_TYPE)) {
            $start = $token->getOffset();
            $tagName = $token->test(Token::BLOCK_START_TYPE) ? $stream->getCurrent()->getValue() : null;
        }
        if ($token->test(Token::VAR_END_TYPE) || $token->test(Token::BLOCK_END_TYPE)) {
            preg_match('/[-~]?(?:%}|}})/A', $code, $delimiter, 0, $token->getOffset());
            $blocks[] = ['source' => substr($code, $start, $token->getOffset() + strlen($delimiter[0]) - $start), 'tag' => $tagName];
        }
    }

    return $blocks;
}

function findParseError(Environment $environment, string $code): ?string
{
    try {
        $environment->parse($environment->tokenize(new Source($code, 'block')));

        return null;
    } catch (SyntaxError $error) {
        return $error->getRawMessage();
    }
}

function findParseErrorInAChildTemplate(Environment $environment, string $code): ?string
{
    return findParseError($environment, "{% extends 'parent' %}{% block oracle %}" . $code . '{% endblock %}');
}

// Parses one block as Twig would inside a template: an opening tag gets its end tag, a middle tag its opening tag.
function describeBlock(Environment $environment, array $block): ?array
{
    $source = $block['source'];
    $tagName = $block['tag'];
    if ($tagName !== null && str_starts_with($tagName, 'end')) {
        return null;
    }
    $code = in_array($tagName, MIDDLE_TAGS, true) ? '{% if true %}' . $source . '{% endif %}' : $source;
    $error = findParseError($environment, $code);
    if ($tagName !== null && $error !== null && str_contains($error, 'end of template')) {
        $code .= '{% end' . $tagName . ' %}';
        $error = findParseError($environment, $code);
    }
    if ($error !== null && findParseErrorInAChildTemplate($environment, $code) === null) {
        $error = null;
    }

    return ['source' => $source, 'error' => $error];
}

function describeTemplate(Environment $environment, string $code): array
{
    try {
        $blocks = findBlockSources($environment, $code);
    } catch (SyntaxError $error) {
        return ['error' => $error->getRawMessage()];
    }

    return ['blocks' => array_values(array_filter(array_map(fn (array $block) => describeBlock($environment, $block), $blocks)))];
}

if ($argv[1] === '--stdin') {
    while (($path = fgets(STDIN)) !== false) {
        $path = trim($path);
        if ($path === '') {
            continue;
        }
        $result = ['path' => $path, 'twig' => $twigVersion] + describeTemplate($environment, file_get_contents($path));
        fwrite(STDOUT, json_encode($result, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) . "\n");
    }
    exit(0);
}

$fixtureFiles = glob(rtrim($argv[1], '/') . '/*.twig');
sort($fixtureFiles);

foreach ($fixtureFiles as $fixtureFile) {
    $name = basename($fixtureFile);
    $golden = ['twig' => $twigVersion] + describeTemplate($environment, file_get_contents($fixtureFile));
    $goldenFile = preg_replace('/\.twig$/', '.blocks.json', $fixtureFile);
    file_put_contents($goldenFile, json_encode($golden, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n");
    $rejected = count(array_filter($golden['blocks'] ?? [], fn (array $block) => $block['error'] !== null));
    fwrite(STDOUT, sprintf("%s -> %s\n", $name, isset($golden['error']) ? 'error: ' . $golden['error'] : count($golden['blocks']) . " blocks, $rejected rejected"));
}
