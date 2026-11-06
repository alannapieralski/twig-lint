<?php

declare(strict_types=1);

/**
 * Records what real Twig says about each block of a template, so that the parser's own verdicts can be compared with it.
 *
 * 1. findBlockSources() tokenises the template with Twig and cuts out the source of every {{ }} and {% %} block.
 * 2. describeBlock() parses each block on its own as Twig would inside a template: an opening tag is given its end
 *    tag, an end or middle tag the opening tag it belongs to in the template, and a block Twig only rejects when it
 *    stands alone is retried inside a child template. An end tag with no opening tag Twig accepts gets no verdict.
 * 3. The result is written to <name>.blocks.json beside each fixture (or printed with --stdin for the corpus check).
 *
 * Unknown filters, functions and tests are accepted, because which ones exist depends on the extensions a site loads.
 */

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

const PARENTS_OF_MIDDLE_TAG = ['else' => ['if', 'for', 'guard'], 'elseif' => ['if']];

function isEndTag(?string $tagName): bool
{
    return $tagName !== null && str_starts_with($tagName, 'end');
}

// Finds the open tag an end or middle tag belongs to: the nearest one of a fitting name that Twig accepts when closed plainly.
function findOpenerIndex(Environment $environment, array $openers, array $openerNames): ?int
{
    for ($index = count($openers) - 1; $index >= 0; $index--) {
        $opener = $openers[$index];
        if (in_array($opener['tag'], $openerNames, true) && findParseError($environment, $opener['source'] . '{% end' . $opener['tag'] . ' %}') === null) {
            return $index;
        }
    }

    return null;
}

function withChildTemplateRetry(Environment $environment, string $code, ?string $error): ?string
{
    if ($error !== null && findParseErrorInAChildTemplate($environment, $code) === null) {
        return null;
    }

    return $error;
}

// Parses one block as Twig would inside a template: an opening tag gets its end tag, and an end or middle tag its opening tag from the template.
function describeBlock(Environment $environment, array $block, array &$openers): ?array
{
    $source = $block['source'];
    $tagName = $block['tag'];
    if (isEndTag($tagName)) {
        $openerIndex = findOpenerIndex($environment, $openers, [substr($tagName, 3)]);
        if ($openerIndex === null) {
            return null;
        }
        $code = $openers[$openerIndex]['source'] . $source;
        $openers = array_slice($openers, 0, $openerIndex);

        return ['source' => $source, 'error' => withChildTemplateRetry($environment, $code, findParseError($environment, $code))];
    }
    if ($tagName !== null && isset(PARENTS_OF_MIDDLE_TAG[$tagName])) {
        $openerIndex = findOpenerIndex($environment, $openers, PARENTS_OF_MIDDLE_TAG[$tagName]);
        $opener = $openerIndex === null ? ['source' => '{% if true %}', 'tag' => 'if'] : $openers[$openerIndex];
        $code = $opener['source'] . $source . '{% end' . $opener['tag'] . ' %}';

        return ['source' => $source, 'error' => withChildTemplateRetry($environment, $code, findParseError($environment, $code))];
    }
    if ($tagName !== null) {
        $openers[] = $block;
    }
    $code = $source;
    $error = findParseError($environment, $code);
    if ($tagName !== null && $error !== null && str_contains($error, 'end of template')) {
        $code .= '{% end' . $tagName . ' %}';
        $error = findParseError($environment, $code);
    }

    return ['source' => $source, 'error' => withChildTemplateRetry($environment, $code, $error)];
}

function describeTemplate(Environment $environment, string $code): array
{
    try {
        $blocks = findBlockSources($environment, $code);
    } catch (SyntaxError $error) {
        return ['error' => $error->getRawMessage()];
    }

    $openers = [];
    $verdicts = [];
    foreach ($blocks as $block) {
        $verdict = describeBlock($environment, $block, $openers);
        if ($verdict !== null) {
            $verdicts[] = $verdict;
        }
    }

    return ['blocks' => $verdicts];
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
