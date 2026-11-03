<?php

declare(strict_types=1);

require __DIR__ . '/vendor/autoload.php';

use Twig\Environment;
use Twig\ExpressionParser\InfixExpressionParserInterface;
use Twig\ExpressionParser\PrefixExpressionParserInterface;
use Twig\Extension\SandboxExtension;
use Twig\Lexer;
use Twig\Loader\ArrayLoader;
use Twig\Sandbox\SecurityPolicy;
use Twig\Token;

const USAGE = "Usage: php tools/twig-oracle/syntax.php <output json file>\n"
    . "  Writes every tag, lexer-level tag, test, expression parser with its precedence, token type and punctuation character\n"
    . "  that the installed Twig version defines.\n";

const LEXER_TAGS = ['line', 'verbatim'];

if ($argc !== 2) {
    fwrite(STDERR, USAGE);
    exit(1);
}

$environment = new Environment(new ArrayLoader([]));
$environment->addExtension(new SandboxExtension(new SecurityPolicy()));

function shortClassName(object $object): string
{
    return substr(strrchr('\\' . $object::class, '\\'), 1);
}

$tags = [];
foreach ($environment->getExtensions() as $extension) {
    foreach ($extension->getTokenParsers() as $tokenParser) {
        $tags[] = ['name' => $tokenParser->getTag(), 'extension' => shortClassName($extension)];
    }
}
usort($tags, fn (array $a, array $b) => strcmp($a['name'], $b['name']));

$expressions = [];
foreach ($environment->getExpressionParsers() as $parser) {
    $expressions[] = [
        'type' => $parser instanceof PrefixExpressionParserInterface ? 'prefix' : 'infix',
        'parser' => shortClassName($parser),
        'name' => $parser->getName(),
        'aliases' => array_values($parser->getAliases()),
        'precedence' => $parser->getPrecedence(),
        'associativity' => $parser instanceof InfixExpressionParserInterface ? strtolower($parser->getAssociativity()->name) : null,
    ];
}
usort($expressions, fn (array $a, array $b) => [$a['type'], $a['parser'], $a['name']] <=> [$b['type'], $b['parser'], $b['name']]);

$tests = array_keys($environment->getTests());
sort($tests);
$testsWithOneMandatoryArgument = array_values(array_filter($tests, fn (string $name) => $environment->getTest($name)->hasOneMandatoryArgument()));

$tokenTypes = [];
foreach ((new ReflectionClass(Token::class))->getReflectionConstants() as $constant) {
    $isDeprecated = str_contains((string) $constant->getDocComment(), '@deprecated');
    if (str_ends_with($constant->getName(), '_TYPE') && !$isDeprecated) {
        $tokenTypes[] = Token::typeToEnglish($constant->getValue());
    }
}
sort($tokenTypes);

$inventory = [
    'twig' => Environment::VERSION,
    'tags' => $tags,
    'lexerTags' => LEXER_TAGS,
    'tests' => $tests,
    'testsWithOneMandatoryArgument' => $testsWithOneMandatoryArgument,
    'expressions' => $expressions,
    'tokenTypes' => $tokenTypes,
    'punctuation' => str_split(Lexer::PUNCTUATION),
];

file_put_contents($argv[1], json_encode($inventory, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n");
fwrite(STDOUT, sprintf(
    "Twig %s: %d tags, %d tests, %d expression parsers -> %s\n",
    Environment::VERSION,
    count($tags),
    count($tests),
    count($expressions),
    $argv[1],
));
